using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using System;
using System.Data;
using System.Security.Cryptography;
using System.Text;
using System.Globalization;
using BIRAMA.API.Data;
using BIRAMA.API.DTOs;
using BIRAMA.API.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BIRAMA.API.Controllers
{
    [ApiController]
    [Route("api/bookings")]
    public class BookingsController : ControllerBase
    {
        private readonly BiramaDbContext _context;
        private readonly ILogger<BookingsController> _logger;

        public BookingsController(
            BiramaDbContext context,
            ILogger<BookingsController> logger)
        {
            _context = context;
            _logger = logger;
        }

        // =====================================================
        // GENERATE BOOKING NUMBER
        // =====================================================

        private static string GenerateBookingNumber(
            DateTimeOffset createdAt)
        {
            var randomCode = Convert.ToHexString(
                RandomNumberGenerator.GetBytes(8)
            );

            return $"BRM-{createdAt:yyyyMMdd}-{randomCode}";
        }

        // =====================================================
        // CREATE BOOKING
        // POST: api/bookings
        // =====================================================

        [Authorize]
        [HttpPost]
        public async Task<IActionResult> CreateBooking(
            [FromBody] CreateBookingRequest request)
        {
            // 1. Validasi format tanggal dan waktu dari frontend v6.
            if (!DateOnly.TryParseExact(request.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var bookingDate) ||
                !TimeOnly.TryParseExact(request.StartTime, "HH:mm", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var startTime) ||
                !TimeOnly.TryParseExact(request.EndTime, "HH:mm", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var endTime))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Format tanggal/waktu tidak valid. Gunakan date yyyy-MM-dd dan startTime/endTime HH:mm."
                });
            }

            var wib = TimeSpan.FromHours(7);
            var startDateTime = new DateTimeOffset(bookingDate.ToDateTime(startTime), wib);
            var endDateTime = new DateTimeOffset(bookingDate.ToDateTime(endTime), wib);

            if (startDateTime >= endDateTime)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Waktu selesai harus lebih besar dari waktu mulai dan berada pada tanggal yang sama."
                });
            }

            var now = DateTimeOffset.UtcNow.ToOffset(wib);

            // 3. Generate Booking Number
            var bookingNumber = GenerateBookingNumber(now);

            // 4. Generate Cancellation Code
            var cancellationCode = Convert.ToBase64String(
                RandomNumberGenerator.GetBytes(32))
                .Replace("+", "-")
                .Replace("/", "_")
                .TrimEnd('=');

            // 5. Hash Cancellation Code
            var cancellationTokenHash = Convert.ToHexString(
                SHA256.HashData(
                    Encoding.UTF8.GetBytes(cancellationCode)));

            // 6. Mulai transaksi
            await using var transaction =
                await _context.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable);

            try
            {
                // 7. Periksa ruangan
                var room = await _context.Rooms
                    .FirstOrDefaultAsync(r =>
                        r.RoomCode == request.RoomId &&
                        r.IsActive);

                if (room == null)
                {
                    return NotFound(new
                    {
                        success = false,
                        message = "Ruangan tidak ditemukan atau sudah tidak aktif."
                    });
                }

                // 8. Periksa bentrok dengan booking Pending atau Approved
                var isConflict = await _context.Bookings
                    .AnyAsync(b =>
                        b.RoomId == room.RoomId &&
                        (b.Status == "Pending" || b.Status == "Approved") &&
                        b.StartDateTime < endDateTime &&
                        b.EndDateTime > startDateTime);

                if (isConflict)
                {
                    return Conflict(new
                    {
                        success = false,
                        message = "Ruangan sudah dibooking pada rentang waktu tersebut. Silakan pilih jadwal lain."
                    });
                }

                // 9. Buat booking
                var booking = new Booking
                {
                    BookingId = Guid.NewGuid(),
                    BookingNumber = bookingNumber,

                    RoomId = room.RoomId,

                    StartDateTime = startDateTime,
                    EndDateTime = endDateTime,
                    IsAllDay = request.StartTime == "00:00" && request.EndTime == "23:59",

                    EventName = request.EventName.Trim(),
                    Layout = null,
                    ParticipantCount = request.Participants,
                    HasExternalParty = request.Vendor == "Ada",
                    Institution = request.Satker.Trim(),

                    ApplicantName = string.IsNullOrWhiteSpace(request.ApplicantName)
                        ? request.PicName.Trim()
                        : request.ApplicantName.Trim(),
                    PICName = request.PicName.Trim(),
                    PICContact = request.PicContact.Trim(),
                    PICEmail = request.PicEmail.Trim(),
                    ApplicantEmail = User.FindFirstValue(ClaimTypes.Email)!,
                    OwnerUserId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),

                    CancellationTokenHash = cancellationTokenHash,

                    Status = "Pending",
                    RejectionReason = null,

                    SubmittedAt = now,
                    CreatedAt = now,
                    UpdatedAt = now
                };

                _context.Bookings.Add(booking);

                // 10. Catat status awal booking
                var statusLog = new BookingStatusLog
                {
                    BookingId = booking.BookingId,
                    OldStatus = null,
                    NewStatus = "Pending",
                    ChangedBy = "Public User",
                    ChangedAt = now,
                    Notes = "Booking submitted and awaiting admin approval."
                };

                _context.BookingStatusLogs.Add(statusLog);

                // 11. Simpan booking dan status log
                await _context.SaveChangesAsync();

                // 12. Commit transaksi
                await transaction.CommitAsync();

                _logger.LogInformation(
                    "Booking {BookingId} dengan nomor {BookingNumber} berhasil dibuat.",
                    booking.BookingId,
                    booking.BookingNumber);

                // 13. Response API
                return StatusCode(201, new
                {
                    success = true,
                    message = "Booking berhasil diajukan dan menunggu persetujuan admin.",
                    bookingId = booking.BookingId,
                    bookingNumber = booking.BookingNumber,
                    roomName = room.RoomName,
                    startDateTime = booking.StartDateTime,
                    endDateTime = booking.EndDateTime,
                    status = booking.Status,
                    cancellationCode = cancellationCode
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();

                _logger.LogError(
                    ex,
                    "Terjadi kesalahan saat membuat booking.");

                return StatusCode(500, new
                {
                    success = false,
                    message = "Terjadi kesalahan saat menyimpan booking."
                });
            }
        }

        // =====================================================
        // GET USER BOOKING HISTORY
        // GET: api/bookings/my?ownerEmail=user@example.com
        // NOTE: ownerEmail filter is not an authentication mechanism.
        // Replace with authenticated claims before production deployment.
        // =====================================================

        [Authorize]
        [HttpGet("my")]
        public async Task<IActionResult> GetMyBookings()
        {
            var normalizedEmail = User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(normalizedEmail)) return Unauthorized();
            var entities = await _context.Bookings
                .AsNoTracking()
                .Include(b => b.Room)
                .Include(b => b.StatusLogs)
                .Where(b => b.ApplicantEmail == normalizedEmail)
                .OrderByDescending(b => b.CreatedAt)
                .ToListAsync();

            var bookings = entities.Select(b => new
            {
                bookingId = b.BookingId,
                id = b.BookingNumber,
                ownerEmail = b.ApplicantEmail,
                roomId = b.Room?.RoomCode,
                roomName = b.Room?.RoomName,
                date = b.StartDateTime.ToOffset(TimeSpan.FromHours(7)).ToString("yyyy-MM-dd"),
                startTime = b.StartDateTime.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm"),
                endTime = b.EndDateTime.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm"),
                eventName = b.EventName,
                participants = b.ParticipantCount,
                vendor = b.HasExternalParty ? "Ada" : "Tidak",
                satker = b.Institution,
                picName = b.PICName,
                picContact = b.PICContact,
                picEmail = b.PICEmail,
                status = b.Status,
                rejectionReason = b.RejectionReason,
                createdAt = b.CreatedAt,
                auditLogs = b.StatusLogs.OrderBy(l => l.ChangedAt).Select(l => new
                {
                    status = l.NewStatus,
                    actor = l.ChangedBy,
                    timestamp = l.ChangedAt,
                    note = l.Notes
                }).ToList()
            }).ToList();

            return Ok(new { success = true, data = bookings });
        }

        // =====================================================
        // EDIT OWN PENDING BOOKING
        // PUT: api/bookings/{bookingId}/edit?ownerEmail=user@example.com
        // =====================================================

        [Authorize]
        [HttpPut("{bookingId:guid}/edit")]
        public async Task<IActionResult> EditOwnBooking(
            Guid bookingId,
            [FromBody] CreateBookingRequest request)
        {
            var ownerEmail = User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(ownerEmail)) return Unauthorized();

            if (!DateOnly.TryParseExact(request.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ||
                !TimeOnly.TryParseExact(request.StartTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var start) ||
                !TimeOnly.TryParseExact(request.EndTime, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var end))
                return BadRequest(new { success = false, message = "Format tanggal/waktu tidak valid." });

            var offset = TimeSpan.FromHours(7);
            var startAt = new DateTimeOffset(date.ToDateTime(start), offset);
            var endAt = new DateTimeOffset(date.ToDateTime(end), offset);
            var now = DateTimeOffset.UtcNow.ToOffset(offset);

            if (startAt >= endAt)
                return BadRequest(new { success = false, message = "Waktu selesai harus lebih besar dari waktu mulai." });

            await using var transaction = await _context.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var booking = await _context.Bookings.FirstOrDefaultAsync(b => b.BookingId == bookingId);
                if (booking == null) return NotFound(new { success = false, message = "Booking tidak ditemukan." });
                if (!string.Equals(booking.ApplicantEmail, ownerEmail, StringComparison.OrdinalIgnoreCase))
                    return Forbid();
                if (booking.Status != "Pending")
                    return Conflict(new { success = false, message = "Hanya booking Pending yang dapat diedit." });
                if (booking.StartDateTime <= now)
                    return Conflict(new { success = false, message = "Booking tidak dapat diedit setelah waktu mulai." });

                var room = await _context.Rooms.FirstOrDefaultAsync(r => r.RoomCode == request.RoomId && r.IsActive);
                if (room == null) return NotFound(new { success = false, message = "Ruangan tidak ditemukan atau tidak aktif." });

                var conflict = await _context.Bookings.AnyAsync(b => b.BookingId != bookingId && b.RoomId == room.RoomId &&
                    (b.Status == "Pending" || b.Status == "Approved") && b.StartDateTime < endAt && b.EndDateTime > startAt);
                if (conflict) return Conflict(new { success = false, message = "Ruangan sudah terisi pada jadwal tersebut." });

                booking.RoomId = room.RoomId;
                booking.StartDateTime = startAt;
                booking.EndDateTime = endAt;
                booking.IsAllDay = request.StartTime == "00:00" && request.EndTime == "23:59";
                booking.EventName = request.EventName.Trim();
                booking.ParticipantCount = request.Participants;
                booking.HasExternalParty = request.Vendor == "Ada";
                booking.Institution = request.Satker.Trim();
                booking.ApplicantName = string.IsNullOrWhiteSpace(request.ApplicantName) ? request.PicName.Trim() : request.ApplicantName.Trim();
                booking.PICName = request.PicName.Trim();
                booking.PICContact = request.PicContact.Trim();
                booking.PICEmail = request.PicEmail.Trim();
                booking.UpdatedAt = now;

                _context.BookingStatusLogs.Add(new BookingStatusLog
                {
                    BookingId = booking.BookingId,
                    OldStatus = "Pending",
                    NewStatus = "Pending",
                    ChangedBy = ownerEmail,
                    ChangedAt = now,
                    Notes = "Booking details edited by applicant."
                });

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
                return Ok(new { success = true, message = "Booking berhasil diperbarui.", bookingId, status = booking.Status });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Gagal mengedit booking {BookingId}.", bookingId);
                return StatusCode(500, new { success = false, message = "Terjadi kesalahan saat memperbarui booking." });
            }
        }

        // =====================================================
        // CANCEL OWN BOOKING (authenticated applicant)
        // POST: api/bookings/{bookingId}/my-cancel
        // =====================================================
        [Authorize]
        [HttpPost("{bookingId:guid}/my-cancel")]
        public async Task<IActionResult> CancelOwnBooking(
            Guid bookingId,
            [FromBody] CancelBookingRequest? request)
        {
            var ownerEmail = User.FindFirstValue(ClaimTypes.Email);
            if (string.IsNullOrWhiteSpace(ownerEmail)) return Unauthorized();

            var booking = await _context.Bookings
                .FirstOrDefaultAsync(b => b.BookingId == bookingId);
            if (booking == null)
                return NotFound(new { success = false, message = "Booking tidak ditemukan." });

            if (!string.Equals(booking.ApplicantEmail, ownerEmail, StringComparison.OrdinalIgnoreCase))
                return Forbid();

            if (booking.Status != "Pending" && booking.Status != "Approved")
                return Conflict(new { success = false, message = "Hanya booking Pending atau Approved yang dapat dibatalkan." });

            var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
            if (booking.StartDateTime <= now)
                return Conflict(new { success = false, message = "Booking tidak dapat dibatalkan setelah sesi dimulai." });

            var oldStatus = booking.Status;
            booking.Status = "Cancelled";
            booking.UpdatedAt = now;
            _context.BookingStatusLogs.Add(new BookingStatusLog
            {
                BookingId = booking.BookingId,
                OldStatus = oldStatus,
                NewStatus = "Cancelled",
                ChangedBy = ownerEmail,
                ChangedAt = now,
                Notes = string.IsNullOrWhiteSpace(request?.Reason)
                    ? "Booking cancelled by applicant."
                    : request!.Reason.Trim()
            });

            await _context.SaveChangesAsync();
            return Ok(new
            {
                success = true,
                message = "Booking berhasil dibatalkan.",
                bookingId = booking.BookingId,
                oldStatus,
                newStatus = booking.Status,
                cancelledAt = now
            });
        }

        // =====================================================
        // CANCEL BOOKING
        // POST: api/bookings/{bookingId}/cancel
        // =====================================================

        [HttpPost("{bookingId:guid}/cancel")]
        public async Task<IActionResult> CancelBooking(
            Guid bookingId,
            [FromBody] CancelBookingRequest request)
        {
            // 1. Validasi Cancellation Code
            if (string.IsNullOrWhiteSpace(request.CancellationCode))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Cancellation Code wajib diisi."
                });
            }

            // 2. Mulai transaksi
            await using var transaction =
                await _context.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable);

            try
            {
                // 3. Cari booking
                var booking = await _context.Bookings
                    .FirstOrDefaultAsync(b =>
                        b.BookingId == bookingId);

                if (booking == null)
                {
                    return NotFound(new
                    {
                        success = false,
                        message = "Booking tidak ditemukan."
                    });
                }

                // 4. Periksa status booking
                if (booking.Status != "Pending" && booking.Status != "Approved")
                {
                    return Conflict(new
                    {
                        success = false,
                        message = "Booking hanya dapat dibatalkan saat berstatus Pending atau Approved."
                    });
                }

                // 5. Periksa hash Cancellation Code
                if (string.IsNullOrWhiteSpace(
                    booking.CancellationTokenHash))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Kode pembatalan tidak valid."
                    });
                }

                // 6. Hash kode yang dikirim pengguna
                var inputHash = SHA256.HashData(
                    Encoding.UTF8.GetBytes(
                        request.CancellationCode));

                byte[] storedHash;

                try
                {
                    storedHash = Convert.FromHexString(
                        booking.CancellationTokenHash);
                }
                catch (FormatException)
                {
                    _logger.LogError(
                        "Hash Cancellation Code tidak valid untuk booking {BookingId}.",
                        bookingId);

                    return StatusCode(500, new
                    {
                        success = false,
                        message = "Data kode pembatalan tidak valid."
                    });
                }

                // 7. Bandingkan hash secara aman
                if (!CryptographicOperations.FixedTimeEquals(
                    inputHash, storedHash))
                {
                    return Unauthorized(new
                    {
                        success = false,
                        message = "Kode pembatalan tidak valid."
                    });
                }

                if (booking.StartDateTime <= DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7)))
                {
                    return Conflict(new { success = false, message = "Booking tidak dapat dibatalkan setelah sesi dimulai." });
                }

                // 8. Simpan status lama
                var oldStatus = booking.Status;

                var now = DateTimeOffset.UtcNow.ToOffset(
                    TimeSpan.FromHours(7));

                // 9. Ubah status booking
                booking.Status = "Cancelled";
                booking.UpdatedAt = now;

                // 10. Catat perubahan status
                var statusLog = new BookingStatusLog
                {
                    BookingId = booking.BookingId,
                    OldStatus = oldStatus,
                    NewStatus = "Cancelled",
                    ChangedBy = "Public User",
                    ChangedAt = now,
                    Notes = "Booking cancelled by user using cancellation code."
                };

                _context.BookingStatusLogs.Add(statusLog);

                // 11. Simpan perubahan
                await _context.SaveChangesAsync();

                // 12. Commit transaksi
                await transaction.CommitAsync();

                _logger.LogInformation(
                    "Booking {BookingId} berhasil dibatalkan oleh pengguna.",
                    bookingId);

                return Ok(new
                {
                    success = true,
                    message = "Booking berhasil dibatalkan.",
                    bookingId = booking.BookingId,
                    oldStatus = oldStatus,
                    newStatus = booking.Status,
                    cancelledAt = now
                });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();

                _logger.LogError(
                    ex,
                    "Terjadi kesalahan saat membatalkan booking {BookingId}.",
                    bookingId);

                return StatusCode(500, new
                {
                    success = false,
                    message = "Terjadi kesalahan saat membatalkan booking."
                });
            }
        }
    }
}