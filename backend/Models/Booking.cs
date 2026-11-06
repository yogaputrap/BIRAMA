
namespace BIRAMA.API.Models;

public class Booking
{
    public Guid BookingId { get; set; }
    public string? BookingNumber { get; set; }

    public Guid RoomId { get; set; }
    public Guid? OwnerUserId { get; set; }
    public string? PICEmail { get; set; }
    public Room? Room { get; set; }
    public UserAccount? OwnerUser { get; set; }

    public DateTimeOffset StartDateTime { get; set; }
    public DateTimeOffset EndDateTime { get; set; }
    public bool IsAllDay { get; set; }

    public string EventName { get; set; } = string.Empty;
    public string? Layout { get; set; }
    public int ParticipantCount { get; set; }
    public bool HasExternalParty { get; set; }

    public string Institution { get; set; } = string.Empty;
    public string ApplicantName { get; set; } = string.Empty;
    public string PICName { get; set; } = string.Empty;
    public string PICContact { get; set; } = string.Empty;
    public string ApplicantEmail { get; set; } = string.Empty;

    // Cancellation
    public string? CancellationTokenHash { get; set; }

    public string? Status { get; set; }
    public string? RejectionReason { get; set; }

    public DateTimeOffset SubmittedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? UpdatedAt { get; set; }

    public ICollection<BookingStatusLog> StatusLogs { get; set; }
        = new List<BookingStatusLog>();
}
