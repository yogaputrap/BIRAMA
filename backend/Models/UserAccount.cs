namespace BIRAMA.API.Models;

public class UserAccount
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PasswordHash { get; set; }
    public string Role { get; set; } = "user";
    public string Provider { get; set; } = "email";
    public string? Satker { get; set; }
    public string? Phone { get; set; }
    public bool EmailVerified { get; set; }
    public DateTimeOffset? EmailVerifiedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public string? RoleChangedBy { get; set; }
    public DateTimeOffset? RoleChangedAt { get; set; }

    public ICollection<Booking> Bookings { get; set; } = new List<Booking>();
}
