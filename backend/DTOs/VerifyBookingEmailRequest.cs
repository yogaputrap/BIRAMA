using System.ComponentModel.DataAnnotations;

namespace BIRAMA.API.DTOs;

public class VerifyBookingEmailRequest
{
    [Required]
    public Guid BookingId { get; set; }

    [Required]
    public string Token { get; set; } = string.Empty;
}