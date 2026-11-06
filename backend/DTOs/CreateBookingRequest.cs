using System.ComponentModel.DataAnnotations;

namespace BIRAMA.API.DTOs;

/// <summary>
/// Request contract aligned with the BIRAMA v6 frontend booking object.
/// date: yyyy-MM-dd; startTime/endTime: HH:mm (WIB).
/// </summary>
public class CreateBookingRequest
{
    [Required]
    [StringLength(20)]
    public string RoomId { get; set; } = string.Empty; // Frontend room code, e.g. AD

    [Required]
    public string Date { get; set; } = string.Empty;

    [Required]
    public string StartTime { get; set; } = string.Empty;

    [Required]
    public string EndTime { get; set; } = string.Empty;

    [Required]
    [StringLength(200)]
    public string EventName { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int Participants { get; set; }

    [Required]
    [RegularExpression("^(Ada|Tidak)$", ErrorMessage = "Vendor harus bernilai 'Ada' atau 'Tidak'.")]
    public string Vendor { get; set; } = "Tidak";

    [Required]
    [StringLength(200)]
    public string Satker { get; set; } = string.Empty;

    [StringLength(150)]
    public string? ApplicantName { get; set; }

    [Required]
    [StringLength(150)]
    public string PicName { get; set; } = string.Empty;

    [Required]
    [StringLength(16)]
    [RegularExpression(@"^\+?[0-9]{9,15}$", ErrorMessage = "Nomor Kontak / WhatsApp hanya boleh berisi 9–15 digit angka, dengan tanda + opsional di awal.")]
    public string PicContact { get; set; } = string.Empty;

    [Required]
    [EmailAddress(ErrorMessage = "Format Email Aktif tidak valid. Contoh: nama@email.com.")]
    [StringLength(254)]
    public string PicEmail { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    [StringLength(254)]
    public string OwnerEmail { get; set; } = string.Empty;
}
