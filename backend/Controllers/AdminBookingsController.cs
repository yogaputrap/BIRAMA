using Microsoft.AspNetCore.Authorization;

using System;
using System.Data;
using BIRAMA.API.Data;
using BIRAMA.API.DTOs;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BIRAMA.API.Controllers
{
    [ApiController]
    [Authorize(Roles = "admin")]
    [Route("api/admin/bookings")]
    public class AdminBookingsController : ControllerBase
    {
        private readonly BiramaDbContext _context;

        public AdminBookingsController(BiramaDbContext context)
        {
            _context = context;
        }

        // =====================================================
        // GET: api/admin/bookings
        // Mengambil daftar booking dengan filter dan pagination
        // =====================================================
        [HttpGet]
        public async Task<IActionResult> GetAllBookings(
            [FromQuery] DateOnly? startDate,
            [FromQuery] DateOnly? endDate,
            [FromQuery] Guid? roomId,
            [FromQuery] string? status,
            [FromQuery] string? search,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            // Validasi rentang tanggal
            if (startDate.HasValue &&
                endDate.HasValue &&
                startDate.Value > endDate.Value)
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Tanggal mulai tidak boleh melebihi tanggal selesai."
                });
            }

            // Validasi status
            if (!string.IsNullOrWhiteSpace(status))
            {
                status = status.Trim();

                if (status != "Pending" && status != "Approved" && status != "Rejected" && status != "Cancelled" && status != "Expired" && status != "Completed")
                {
                    return BadRequest(new
                    {
                        success = false,
                        message = "Status tidak valid."
                    });
                }
            }

            // Normalisasi pagination
            page = Math.Max(page, 1);
            pageSize = Math.Clamp(pageSize, 1, 100);

            // Zona waktu WIB
            var wibOffset = TimeSpan.FromHours(7);

            var query =
                from b in _context.Bookings
                join r in _context.Rooms
                    on b.RoomId equals r.RoomId
                select new
                {
                    b.BookingId,
                    b.BookingNumber,

                    b.RoomId,
                    RoomName = r.RoomName,

                    b.StartDateTime,
                    b.EndDateTime,
                    b.IsAllDay,

                    b.EventName,
                    b.Layout,
                    b.ParticipantCount,
                    b.HasExternalParty,
                    b.Institution,

                    b.ApplicantName,
                    b.ApplicantEmail,
                    b.PICName,
                    b.PICContact,

                    b.Status,
                    b.SubmittedAt,
                    b.CreatedAt,
                    b.UpdatedAt
                };

            // Filter tanggal mulai
            if (startDate.HasValue)
            {
                var startBoundary = new DateTimeOffset(
                    startDate.Value.ToDateTime(TimeOnly.MinValue),
                    wibOffset
                );

                query = query.Where(b =>
                    b.EndDateTime > startBoundary
                );
            }

            // Filter tanggal selesai
            if (endDate.HasValue)
            {
                var endBoundary = new DateTimeOffset(
                    endDate.Value.AddDays(1).ToDateTime(TimeOnly.MinValue),
                    wibOffset
                );

                query = query.Where(b =>
                    b.StartDateTime < endBoundary
                );
            }

            // Filter ruangan
            if (roomId.HasValue)
            {
                query = query.Where(b =>
                    b.RoomId == roomId.Value
                );
            }

            // Filter status
            if (!string.IsNullOrWhiteSpace(status))
            {
                query = query.Where(b =>
                    b.Status == status
                );
            }

            // Pencarian
            if (!string.IsNullOrWhiteSpace(search))
            {
                var keyword = search.Trim();

                query = query.Where(b =>
                    (b.BookingNumber != null &&
                     b.BookingNumber.Contains(keyword)) ||
                    (b.EventName != null &&
                     b.EventName.Contains(keyword)) ||
                    (b.ApplicantName != null &&
                     b.ApplicantName.Contains(keyword)) ||
                    (b.PICName != null &&
                     b.PICName.Contains(keyword)) ||
                    (b.RoomName != null &&
                     b.RoomName.Contains(keyword))
                );
            }

            // Hitung total data sebelum pagination
            var totalRecords = await query.CountAsync();

            var totalPages = (int)Math.Ceiling(
                totalRecords / (double)pageSize
            );

            // Pagination dan pengurutan
            var bookings = await query
                .OrderByDescending(b => b.CreatedAt)
                .ThenBy(b => b.StartDateTime)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Ok(new
            {
                success = true,
                message = "Data booking berhasil diambil.",
                pagination = new
                {
                    currentPage = page,
                    pageSize,
                    totalRecords,
                    totalPages
                },
                data = bookings
            });
        }

        // =====================================================
        // GET: api/admin/bookings/{id}
        // Mengambil detail booking dan riwayat perubahan status
        // =====================================================
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetBookingById(Guid id)
        {
            var booking = await (
                from b in _context.Bookings
                join r in _context.Rooms
                    on b.RoomId equals r.RoomId
                where b.BookingId == id
                select new
                {
                    b.BookingId,
                    b.BookingNumber,

                    b.RoomId,
                    RoomName = r.RoomName,
                    r.RoomCode,
                    r.Building,
                    r.Floor,
                    r.Capacity,

                    b.StartDateTime,
                    b.EndDateTime,
                    b.IsAllDay,

                    b.EventName,
                    b.Layout,
                    b.ParticipantCount,
                    b.HasExternalParty,
                    b.Institution,

                    b.ApplicantName,
                    b.ApplicantEmail,
                    b.PICName,
                    b.PICContact,

                    b.Status,
                    b.SubmittedAt,
                    b.CreatedAt,
                    b.UpdatedAt
                }
            ).FirstOrDefaultAsync();

            if (booking == null)
            {
                return NotFound(new
                {
                    success = false,
                    message = "Data booking tidak ditemukan."
                });
            }

            // Ambil riwayat perubahan status
            var statusHistory = await _context.BookingStatusLogs
                .Where(log => log.BookingId == id)
                .OrderBy(log => log.ChangedAt)
                .Select(log => new
                {
                    log.LogId,
                    log.OldStatus,
                    log.NewStatus,
                    log.ChangedBy,
                    log.ChangedAt,
                    log.Notes
                })
                .ToListAsync();

            return Ok(new
            {
                success = true,
                message = "Detail booking berhasil diambil.",
                data = booking,
                statusHistory
            });
        }

        // =====================================================
        // PATCH: api/admin/bookings/{id}/cancel
        // Membatalkan booking oleh admin
        // =====================================================
        [HttpPatch("{id:guid}/cancel")]
        public async Task<IActionResult> CancelBookingByAdmin(
            Guid id,
            [FromBody] AdminCancelBookingRequest request)
        {
            await using var transaction =
                await _context.Database.BeginTransactionAsync(
                    IsolationLevel.Serializable
                );

            try
            {
                var booking = await _context.Bookings
                    .FirstOrDefaultAsync(b => b.BookingId == id);

                if (booking == null)
                {
                    return NotFound(new
                    {
                        success = false,
                        message = "Data booking tidak ditemukan."
                    });
                }

                if (booking.Status != "Pending" && booking.Status != "Approved")
                {
                    return Conflict(new
                    {
                        success = false,
                        message = "Booking hanya dapat dibatalkan saat berstatus Pending atau Approved."
                    });
                }

                // Waktu saat ini dalam WIB
                var now = new DateTimeOffset(
                    DateTime.UtcNow,
                    TimeSpan.Zero
                ).ToOffset(TimeSpan.FromHours(7));

                var oldStatus = booking.Status;

                // Ubah status booking
                booking.Status = "Cancelled";
                booking.UpdatedAt = now;

                // Catatan pembatalan
                var notes = string.IsNullOrWhiteSpace(request.Notes)
                    ? "Booking cancelled by admin."
                    : $"Booking cancelled by admin. Reason: {request.Notes.Trim()}";

                // Catat perubahan status
                var statusLog = new Models.BookingStatusLog
                {
                    BookingId = booking.BookingId,
                    OldStatus = oldStatus,
                    NewStatus = "Cancelled",
                    ChangedBy = "Admin",
                    ChangedAt = now,
                    Notes = notes
                };

                _context.BookingStatusLogs.Add(statusLog);

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Ok(new
                {
                    success = true,
                    message = "Booking berhasil dibatalkan oleh admin.",
                    bookingId = booking.BookingId,
                    oldStatus,
                    newStatus = booking.Status,
                    cancelledAt = now,
                    notes
                });
            }
            catch
            {
                await transaction.RollbackAsync();
                throw;
            }
        }

        // PATCH api/admin/bookings/{id}/approve
        [HttpPatch("{id:guid}/approve")]
        public async Task<IActionResult> ApproveBooking(Guid id)
        {
            var booking = await _context.Bookings.FirstOrDefaultAsync(b => b.BookingId == id);
            if (booking == null) return NotFound(new { success = false, message = "Booking tidak ditemukan." });
            if (booking.Status != "Pending") return Conflict(new { success = false, message = "Hanya booking Pending yang dapat disetujui." });
            var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
            var conflict = await _context.Bookings.AnyAsync(b => b.BookingId != id && b.RoomId == booking.RoomId && b.Status == "Approved" && b.StartDateTime < booking.EndDateTime && b.EndDateTime > booking.StartDateTime);
            if (conflict) return Conflict(new { success = false, message = "Jadwal berbenturan dengan booking yang sudah disetujui." });
            booking.Status = "Approved"; booking.UpdatedAt = now;
            _context.BookingStatusLogs.Add(new BIRAMA.API.Models.BookingStatusLog { BookingId = id, OldStatus = "Pending", NewStatus = "Approved", ChangedBy = "Admin", ChangedAt = now, Notes = "Booking approved by admin." });
            await _context.SaveChangesAsync();
            return Ok(new { success = true, bookingId = id, status = booking.Status, changedAt = now });
        }

        // PATCH api/admin/bookings/{id}/reject
        [HttpPatch("{id:guid}/reject")]
        public async Task<IActionResult> RejectBooking(Guid id, [FromBody] BIRAMA.API.DTOs.RejectBookingRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Reason)) return BadRequest(new { success = false, message = "Alasan penolakan wajib diisi." });
            var booking = await _context.Bookings.FirstOrDefaultAsync(b => b.BookingId == id);
            if (booking == null) return NotFound(new { success = false, message = "Booking tidak ditemukan." });
            if (booking.Status != "Pending") return Conflict(new { success = false, message = "Hanya booking Pending yang dapat ditolak." });
            var now = DateTimeOffset.UtcNow.ToOffset(TimeSpan.FromHours(7));
            booking.Status = "Rejected"; booking.RejectionReason = request.Reason.Trim(); booking.UpdatedAt = now;
            _context.BookingStatusLogs.Add(new BIRAMA.API.Models.BookingStatusLog { BookingId = id, OldStatus = "Pending", NewStatus = "Rejected", ChangedBy = "Admin", ChangedAt = now, Notes = request.Reason.Trim() });
            await _context.SaveChangesAsync();
            return Ok(new { success = true, bookingId = id, status = booking.Status, rejectionReason = booking.RejectionReason, changedAt = now });
        }
    }
}
