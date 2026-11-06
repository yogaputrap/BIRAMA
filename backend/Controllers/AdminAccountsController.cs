using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using System.Net.Mail;
using BIRAMA.API.Data;
using BIRAMA.API.DTOs;
using BIRAMA.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BIRAMA.API.Controllers;

[ApiController]
[Authorize(Roles = "admin")]
[Route("api/admin/accounts")]
public class AdminAccountsController : ControllerBase
{
    private readonly BiramaDbContext _context;

    public AdminAccountsController(BiramaDbContext context) => _context = context;

    // GET: api/admin/accounts?search=...
    [HttpGet]
    public async Task<IActionResult> GetAccounts([FromQuery] string? search)
    {
        var accountsQuery = _context.UserAccounts.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(search))
        {
            var keyword = search.Trim();
            accountsQuery = accountsQuery.Where(x =>
                x.Name.Contains(keyword) || x.Email.Contains(keyword));
        }

        var accounts = await accountsQuery
            .OrderBy(x => x.Name)
            .Select(x => new
            {
                x.UserId,
                x.Name,
                x.Email,
                x.Role,
                x.Provider,
                x.Satker,
                x.Phone,
                x.CreatedAt,
                x.RoleChangedBy,
                x.RoleChangedAt
            })
            .ToListAsync();

        var grants = await _context.AdminGrants.AsNoTracking()
            .OrderBy(x => x.Email)
            .Select(x => new { x.Email, x.GrantedBy, x.GrantedAt })
            .ToListAsync();

        return Ok(new
        {
            success = true,
            message = "Daftar akun berhasil diambil.",
            data = accounts,
            pendingGrants = grants.Where(g => !accounts.Any(a =>
                string.Equals(a.Email, g.Email, StringComparison.OrdinalIgnoreCase))).ToList()
        });
    }

    // POST: api/admin/accounts/grants
    // Grant juga dapat dibuat sebelum pengguna mendaftar.
    [HttpPost("grants")]
    public async Task<IActionResult> GrantAdmin([FromBody] AdminGrantRequest request)
    {
        var email = NormalizeEmail(request.Email);
        var grantedBy = NormalizeEmail(User.FindFirstValue(ClaimTypes.Email));
        if (!IsValidEmail(email) || !IsValidEmail(grantedBy))
            return BadRequest(new { success = false, message = "Email penerima dan pemberi akses harus valid." });

        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
        await using var transaction = await _context.Database.BeginTransactionAsync();

        var grant = await _context.AdminGrants.FirstOrDefaultAsync(x => x.Email == email);
        if (grant == null)
        {
            _context.AdminGrants.Add(new AdminGrant
            {
                Email = email,
                GrantedBy = grantedBy,
                GrantedAt = now
            });
        }
        else
        {
            grant.GrantedBy = grantedBy;
            grant.GrantedAt = now;
        }

        var account = await _context.UserAccounts.FirstOrDefaultAsync(x => x.Email == email);
        if (account != null)
        {
            account.Role = "admin";
            account.RoleChangedBy = grantedBy;
            account.RoleChangedAt = now;
        }

        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(new
        {
            success = true,
            message = account == null
                ? "Akses admin disimpan dan akan diterapkan ketika email tersebut mendaftar."
                : "Akses admin berhasil diberikan.",
            email,
            role = account?.Role ?? "pending-admin",
            grantedBy,
            grantedAt = now
        });
    }

    // DELETE: api/admin/accounts/grants/{email}
    [HttpDelete("grants/{email}")]
    public async Task<IActionResult> RevokeAdmin(string email, [FromBody] AdminRevokeRequest request)
    {
        email = NormalizeEmail(email);
        var revokedBy = NormalizeEmail(User.FindFirstValue(ClaimTypes.Email));
        if (!IsValidEmail(email) || !IsValidEmail(revokedBy))
            return BadRequest(new { success = false, message = "Email penerima dan pencabut akses harus valid." });

        var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
        await using var transaction = await _context.Database.BeginTransactionAsync();

        var grant = await _context.AdminGrants.FirstOrDefaultAsync(x => x.Email == email);
        if (grant == null)
            return NotFound(new { success = false, message = "Grant admin untuk email tersebut tidak ditemukan." });

        _context.AdminGrants.Remove(grant);
        var account = await _context.UserAccounts.FirstOrDefaultAsync(x => x.Email == email);
        if (account != null && account.Role == "admin")
        {
            account.Role = "user";
            account.RoleChangedBy = revokedBy;
            account.RoleChangedAt = now;
        }

        await _context.SaveChangesAsync();
        await transaction.CommitAsync();

        return Ok(new
        {
            success = true,
            message = account == null
                ? "Grant admin berhasil dicabut."
                : "Akses admin berhasil dicabut dan role akun dikembalikan menjadi user.",
            email,
            role = account?.Role ?? "no-account",
            revokedBy,
            revokedAt = now
        });
    }

    private static string NormalizeEmail(string? value) => (value ?? string.Empty).Trim().ToLowerInvariant();

    private static bool IsValidEmail(string email)
    {
        if (string.IsNullOrWhiteSpace(email) || email.Length > 254) return false;
        try { return new MailAddress(email).Address == email; }
        catch { return false; }
    }
}
