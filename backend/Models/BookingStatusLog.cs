namespace BIRAMA.API.Models;

public class BookingStatusLog
{
    public long LogId { get; set; }
    public Guid BookingId { get; set; }

    public Booking? Booking { get; set; }

    public string? OldStatus { get; set; }
    public string NewStatus { get; set; } = string.Empty;
    public string ChangedBy { get; set; } = string.Empty;
    public DateTimeOffset ChangedAt { get; set; }
    public string? Notes { get; set; }
}