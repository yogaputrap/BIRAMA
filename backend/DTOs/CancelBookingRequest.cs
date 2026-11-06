namespace BIRAMA.API.DTOs;

public class CancelBookingRequest
{
    public string CancellationCode { get; set; } = string.Empty;
    public string? Reason { get; set; }
}
