namespace BIRAMA.API.Models;

public class PICMonitoring
{
    public Guid PICId { get; set; }

    public string FullName { get; set; } = string.Empty;

    public string Uker { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public bool IsActive { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}