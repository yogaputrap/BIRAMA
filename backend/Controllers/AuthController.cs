using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BIRAMA.API.Data;
using BIRAMA.API.DTOs;
using BIRAMA.API.Models;
using BIRAMA.API.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace BIRAMA.API.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private const string PurposeVerify = "verify_email";
    private const string PurposeReset = "reset_password";
    private static readonly TimeSpan VerifyLifetime = TimeSpan.FromHours(24);
    private static readonly TimeSpan ResetLifetime = TimeSpan.FromHours(1);
    private static readonly TimeSpan ResendCooldown = TimeSpan.FromSeconds(60);

    private readonly BiramaDbContext _db;
    private readonly IConfiguration _config;
    private readonly PasswordHasher<UserAccount> _hasher = new();
    private readonly IHttpClientFactory _httpFactory;
    private readonly IEmailSender _email;
    private readonly ILogger<AuthController> _logger;

    public AuthController(BiramaDbContext db, IConfiguration config, IHttpClientFactory httpFactory, IEmailSender email, ILogger<AuthController> logger)
    { _db = db; _config = config; _httpFactory = httpFactory; _email = email; _logger = logger; }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("register")]
    public async Task<IActionResult> Register(RegisterRequest request)
    {
        var email = Normalize(request.Email);
        if (string.IsNullOrWhiteSpace(request.Name) || !ValidEmail(email) || request.Password.Length < 10 || request.Password.Length > 128)
            return BadRequest(new { success = false, message = "Nama dan email wajib valid. Password harus 10–128 karakter." });
        if (await _db.UserAccounts.AnyAsync(x => x.Email == email))
            return Conflict(new { success = false, message = "Email sudah terdaftar." });

        var now = DateTimeOffset.UtcNow;
        var account = new UserAccount
        {
            UserId = Guid.NewGuid(), Name = request.Name.Trim(), Email = email, Role = "user", Provider = "email",
            Satker = request.Satker?.Trim(), Phone = request.Phone?.Trim(), CreatedAt = now,
            EmailVerified = false
        };
        account.PasswordHash = _hasher.HashPassword(account, request.Password);
        var grant = await _db.AdminGrants.FirstOrDefaultAsync(x => x.Email == email);
        if (grant != null) { account.Role = "admin"; account.RoleChangedBy = grant.GrantedBy; account.RoleChangedAt = now; }
        _db.UserAccounts.Add(account);
        await _db.SaveChangesAsync();

        // Tidak ada JWT saat registrasi: akun baru baru bisa masuk setelah email diverifikasi.
        await IssueTokenEmailAsync(account, PurposeVerify);
        return StatusCode(201, new
        {
            success = true,
            requiresEmailVerification = true,
            email = account.Email,
            message = "Akun dibuat. Kami mengirim tautan verifikasi ke email Anda. Verifikasi email terlebih dahulu sebelum masuk."
        });
    }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        var email = Normalize(request.Email);
        var account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email && x.Provider == "email");
        if (account?.PasswordHash == null || _hasher.VerifyHashedPassword(account, account.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
            return Unauthorized(new { success = false, message = "Email atau password salah." });

        // Dicek setelah password benar, sehingga status verifikasi tidak bisa dipakai untuk menebak email terdaftar.
        if (!account.EmailVerified)
            return StatusCode(403, new { success = false, code = "EMAIL_NOT_VERIFIED", email = account.Email, message = "Email belum diverifikasi. Cek kotak masuk Anda atau kirim ulang email verifikasi." });

        return Ok(TokenResponse(account));
    }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("verify-email")]
    public async Task<IActionResult> VerifyEmail(VerifyEmailRequest request)
    {
        var (account, token) = await FindValidTokenAsync(request.Email, request.Token, PurposeVerify);
        if (account == null || token == null)
            return BadRequest(new { success = false, code = "TOKEN_INVALID", message = "Tautan verifikasi tidak valid atau sudah kedaluwarsa. Minta tautan baru." });

        var now = DateTimeOffset.UtcNow;
        token.UsedAt = now;
        account.EmailVerified = true;
        account.EmailVerifiedAt ??= now;
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Email berhasil diverifikasi. Silakan masuk." });
    }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("resend-verification")]
    public async Task<IActionResult> ResendVerification(ResendVerificationRequest request)
    {
        var email = Normalize(request.Email);
        if (ValidEmail(email))
        {
            var account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email && x.Provider == "email" && !x.EmailVerified);
            if (account != null && !await RecentlyIssuedAsync(account.UserId, PurposeVerify))
                await IssueTokenEmailAsync(account, PurposeVerify);
        }
        // Respons selalu sama agar endpoint tidak bisa dipakai untuk mengecek email terdaftar.
        return Ok(new { success = true, message = "Jika email terdaftar dan belum terverifikasi, tautan verifikasi baru telah dikirim." });
    }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("forgot-password")]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordRequest request)
    {
        var email = Normalize(request.Email);
        if (ValidEmail(email))
        {
            // Akun Google tidak punya password BIRAMA. Provider "microsoft" dipertahankan untuk akun lama
            // yang dibuat sebelum login Microsoft dihapus; reset membuat akun tersebut menjadi akun email.
            var account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email && (x.Provider == "email" || x.Provider == "microsoft"));
            if (account != null && !await RecentlyIssuedAsync(account.UserId, PurposeReset))
                await IssueTokenEmailAsync(account, PurposeReset);
        }
        return Ok(new { success = true, message = "Jika email terdaftar, tautan reset kata sandi telah dikirim. Cek kotak masuk Anda." });
    }

    [AllowAnonymous, EnableRateLimiting("auth"), HttpPost("reset-password")]
    public async Task<IActionResult> ResetPassword(ResetPasswordRequest request)
    {
        if (request.NewPassword == null || request.NewPassword.Length < 10 || request.NewPassword.Length > 128)
            return BadRequest(new { success = false, code = "PASSWORD_INVALID", message = "Password harus 10–128 karakter." });

        var (account, token) = await FindValidTokenAsync(request.Email, request.Token, PurposeReset);
        if (account == null || token == null)
            return BadRequest(new { success = false, code = "TOKEN_INVALID", message = "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru." });

        var now = DateTimeOffset.UtcNow;
        account.PasswordHash = _hasher.HashPassword(account, request.NewPassword);
        if (account.Provider == "microsoft") account.Provider = "email";
        // Menerima tautan di email membuktikan kepemilikan email tersebut.
        account.EmailVerified = true;
        account.EmailVerifiedAt ??= now;

        token.UsedAt = now;
        var others = await _db.AuthTokens.Where(x => x.UserId == account.UserId && x.UsedAt == null && x.TokenId != token.TokenId).ToListAsync();
        foreach (var other in others) other.UsedAt = now;
        await _db.SaveChangesAsync();
        return Ok(new { success = true, message = "Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru." });
    }

    // Validasi access token dilakukan oleh server ke API resmi Google.
    // Browser tidak mengirim nama/email yang dapat dimanipulasi sebagai identitas.
    [AllowAnonymous, HttpPost("external")]
    public async Task<IActionResult> ExternalLogin(ExternalLoginRequest request)
    {
        var provider = (request.Provider ?? string.Empty).Trim().ToLowerInvariant();
        if (provider != "google" || string.IsNullOrWhiteSpace(request.AccessToken) || request.AccessToken.Length > 8192)
            return BadRequest(new { success = false, message = "Provider atau access token tidak valid." });

        ExternalProfile? profile;
        try
        {
            profile = await GetGoogleProfile(request.AccessToken);
        }
        catch (HttpRequestException)
        {
            return Unauthorized(new { success = false, message = "Token provider tidak valid atau tidak dapat diverifikasi." });
        }
        catch (JsonException)
        {
            return Unauthorized(new { success = false, message = "Respons identitas dari provider tidak valid." });
        }

        if (profile == null || !ValidEmail(profile.Email) || string.IsNullOrWhiteSpace(profile.Name))
            return Unauthorized(new { success = false, message = "Provider tidak memberikan email dan profil yang valid." });

        var email = Normalize(profile.Email);
        var account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email);
        if (account != null && !string.Equals(account.Provider, provider, StringComparison.OrdinalIgnoreCase))
            return Conflict(new { success = false, message = "Email sudah terdaftar dengan metode login lain. Masuk menggunakan metode awal atau hubungi administrator untuk proses pengaitan akun." });

        if (account == null)
        {
            var now = DateTimeOffset.UtcNow;
            account = new UserAccount
            {
                UserId = Guid.NewGuid(), Name = profile.Name.Trim(), Email = email,
                Role = "user", Provider = provider, CreatedAt = now,
                EmailVerified = true, EmailVerifiedAt = now   // Google hanya diterima jika email_verified = true
            };
            var grant = await _db.AdminGrants.FirstOrDefaultAsync(x => x.Email == email);
            if (grant != null)
            {
                account.Role = "admin";
                account.RoleChangedBy = grant.GrantedBy;
                account.RoleChangedAt = now;
            }
            _db.UserAccounts.Add(account);
            try { await _db.SaveChangesAsync(); }
            catch (DbUpdateException)
            {
                // Menangani dua login pertama yang terjadi bersamaan pada email sama.
                _db.Entry(account).State = EntityState.Detached;
                account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email);
                if (account == null || !string.Equals(account.Provider, provider, StringComparison.OrdinalIgnoreCase))
                    return Conflict(new { success = false, message = "Akun dengan email tersebut sudah dibuat melalui metode login lain." });
            }
        }
        else
        {
            // Sinkronkan nama dari provider tanpa mengubah role atau hak admin.
            if (!string.IsNullOrWhiteSpace(profile.Name) && account.Name != profile.Name.Trim())
            {
                account.Name = profile.Name.Trim();
                await _db.SaveChangesAsync();
            }
        }

        return Ok(TokenResponse(account));
    }

    private async Task<ExternalProfile?> GetGoogleProfile(string accessToken)
    {
        var client = _httpFactory.CreateClient();
        using var message = new HttpRequestMessage(HttpMethod.Get, "https://openidconnect.googleapis.com/v1/userinfo");
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        using var response = await client.SendAsync(message);
        if (!response.IsSuccessStatusCode) throw new HttpRequestException("Google token validation failed.");
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var doc = await JsonDocument.ParseAsync(stream);
        var root = doc.RootElement;
        var email = root.TryGetProperty("email", out var e) ? e.GetString() : null;
        var verified = root.TryGetProperty("email_verified", out var v) && (v.ValueKind == JsonValueKind.True || (v.ValueKind == JsonValueKind.String && v.GetString() == "true"));
        var name = root.TryGetProperty("name", out var n) ? n.GetString() : email;
        if (!verified) return null;
        return new ExternalProfile(name ?? email ?? string.Empty, email ?? string.Empty);
    }

    private sealed record ExternalProfile(string Name, string Email);

    [Authorize, HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var id = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(id, out var userId)) return Unauthorized();
        var account = await _db.UserAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId);
        if (account == null) return Unauthorized();
        return Ok(new { success = true, data = new { account.UserId, account.Name, account.Email, account.Role, account.Provider, account.Satker, account.Phone } });
    }

    // ---------------------------------------------------------------- Token email (verifikasi & reset)

    private async Task<bool> RecentlyIssuedAsync(Guid userId, string purpose)
    {
        var since = DateTimeOffset.UtcNow - ResendCooldown;
        return await _db.AuthTokens.AnyAsync(x => x.UserId == userId && x.Purpose == purpose && x.CreatedAt > since);
    }

    private async Task IssueTokenEmailAsync(UserAccount account, string purpose)
    {
        var now = DateTimeOffset.UtcNow;

        // Hanya satu token aktif per tujuan: token lama dinonaktifkan.
        var active = await _db.AuthTokens.Where(x => x.UserId == account.UserId && x.Purpose == purpose && x.UsedAt == null).ToListAsync();
        foreach (var old in active) old.UsedAt = now;

        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).Replace("+", "-").Replace("/", "_").TrimEnd('=');
        _db.AuthTokens.Add(new AuthToken
        {
            TokenId = Guid.NewGuid(), UserId = account.UserId, Purpose = purpose, TokenHash = HashToken(raw),
            CreatedAt = now, ExpiresAt = now.Add(purpose == PurposeVerify ? VerifyLifetime : ResetLifetime)
        });
        await _db.SaveChangesAsync();

        var route = purpose == PurposeVerify ? "verify-email" : "reset-password";
        var frontend = (_config["Application:FrontendBaseUrl"] ?? "http://localhost:5500").TrimEnd('/');
        var link = $"{frontend}/#/{route}?email={Uri.EscapeDataString(account.Email)}&token={raw}";
        var (subject, html) = purpose == PurposeVerify
            ? AuthEmailTemplates.VerifyEmail(account.Name, link)
            : AuthEmailTemplates.ResetPassword(account.Name, link);

        // Dikirim di latar belakang agar waktu respons tidak membedakan email terdaftar / tidak terdaftar.
        // Kegagalan kirim hanya dicatat; pengguna dapat meminta kirim ulang.
        var to = account.Email;
        _ = Task.Run(async () =>
        {
            try { await _email.SendAsync(to, subject, html, link); }
            catch (Exception ex) { _logger.LogError(ex, "Gagal mengirim email {Purpose} ke {Email}.", purpose, to); }
        });
    }

    private async Task<(UserAccount? Account, AuthToken? Token)> FindValidTokenAsync(string? emailRaw, string? rawToken, string purpose)
    {
        var email = Normalize(emailRaw);
        if (!ValidEmail(email) || string.IsNullOrWhiteSpace(rawToken) || rawToken.Length > 200) return (null, null);

        var account = await _db.UserAccounts.SingleOrDefaultAsync(x => x.Email == email);
        if (account == null) return (null, null);

        var hash = HashToken(rawToken.Trim());
        var now = DateTimeOffset.UtcNow;
        var token = await _db.AuthTokens.FirstOrDefaultAsync(x =>
            x.UserId == account.UserId && x.Purpose == purpose && x.TokenHash == hash && x.UsedAt == null && x.ExpiresAt > now);
        return token == null ? (null, null) : (account, token);
    }

    private static string HashToken(string raw) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(raw)));

    // ----------------------------------------------------------------

    private object TokenResponse(UserAccount account)
    {
        var now = DateTime.UtcNow;
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, account.UserId.ToString()), new Claim(ClaimTypes.Name, account.Name), new Claim(ClaimTypes.Email, account.Email), new Claim(ClaimTypes.Role, account.Role) };
        var token = new JwtSecurityToken(_config["Jwt:Issuer"] ?? "BIRAMA.API", _config["Jwt:Audience"] ?? "BIRAMA.Web", claims, now, now.AddHours(8), creds);
        return new { success = true, message = "Autentikasi berhasil.", token = new JwtSecurityTokenHandler().WriteToken(token), tokenType = "Bearer", expiresAt = token.ValidTo, user = new { account.UserId, account.Name, account.Email, account.Role, account.Provider, account.Satker, account.Phone } };
    }
    private static string Normalize(string? email) => (email ?? "").Trim().ToLowerInvariant();
    private static bool ValidEmail(string email) { try { return email.Length <= 254 && new MailAddress(email).Address == email; } catch { return false; } }
}
