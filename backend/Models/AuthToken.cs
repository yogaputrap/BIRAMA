namespace BIRAMA.API.Models;

/// <summary>
/// Token sekali pakai untuk verifikasi email dan reset password.
/// Yang disimpan hanya hash SHA-256 dari token; token asli hanya ada di email pengguna.
/// </summary>
public class AuthToken
{
    public Guid TokenId { get; set; }
    public Guid UserId { get; set; }
    public string Purpose { get; set; } = string.Empty;   // verify_email | reset_password
    public string TokenHash { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }

    public UserAccount User { get; set; } = null!;
}
