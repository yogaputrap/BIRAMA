using BIRAMA.API.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Globalization;

namespace BIRAMA.API.Controllers
{
    [ApiController]
    [Route("api/bookings")]
    public class BookingAvailabilityController : ControllerBase
    {
        private readonly BiramaDbContext _context;

        public BookingAvailabilityController(BiramaDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Mengambil jadwal ketersediaan ruangan pada tanggal tertentu (WIB / UTC+7).
        /// Contoh: GET api/bookings/availability?date=2026-11-03&roomId=AD
        /// roomId menerima RoomCode frontend (mis. AD) atau GUID RoomId untuk kompatibilitas.
        /// </summary>
        [HttpGet("availability")]
        public async Task<IActionResult> GetAvailability(
            [FromQuery] string? date,
            [FromQuery] string? roomId)
        {
            if (!DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                    DateTimeStyles.None, out var bookingDate))
            {
                return BadRequest(new
                {
                    success = false,
                    message = "Parameter 'date' wajib diisi dengan format YYYY-MM-DD."
                });
            }

            Guid? resolvedRoomId = null;
            if (!string.IsNullOrWhiteSpace(roomId))
            {
                var requestedRoom = roomId.Trim();
                if (Guid.TryParse(requestedRoom, out var parsedGuid))
                {
                    resolvedRoomId = await _context.Rooms.AsNoTracking()
                        .Where(r => r.RoomId == parsedGuid && r.IsActive)
                        .Select(r => (Guid?)r.RoomId)
                        .FirstOrDefaultAsync();
                }
                else
                {
                    resolvedRoomId = await _context.Rooms.AsNoTracking()
                        .Where(r => r.RoomCode == requestedRoom && r.IsActive)
                        .Select(r => (Guid?)r.RoomId)
                        .FirstOrDefaultAsync();
                }

                if (!resolvedRoomId.HasValue)
                {
                    return NotFound(new
                    {
                        success = false,
                        message = "Ruangan tidak ditemukan atau sudah tidak aktif."
                    });
                }
            }

            var startOfDay = new DateTimeOffset(
                bookingDate.ToDateTime(TimeOnly.MinValue), TimeSpan.FromHours(7));
            var endOfDay = startOfDay.AddDays(1);

            var bookingQuery = _context.Bookings.AsNoTracking().Where(b =>
                (b.Status == "Pending" || b.Status == "Approved") &&
                b.StartDateTime < endOfDay && b.EndDateTime > startOfDay);

            if (resolvedRoomId.HasValue)
                bookingQuery = bookingQuery.Where(b => b.RoomId == resolvedRoomId.Value);

            var activeBookings = await bookingQuery.OrderBy(b => b.StartDateTime).ToListAsync();

            var roomQuery = _context.Rooms.AsNoTracking().Where(r => r.IsActive);
            if (resolvedRoomId.HasValue)
                roomQuery = roomQuery.Where(r => r.RoomId == resolvedRoomId.Value);

            var activeRooms = await roomQuery.OrderBy(r => r.RoomCode).ToListAsync();

            var rooms = activeRooms.Select(room => new
            {
                // roomId berupa RoomCode agar konsisten dengan frontend v6.
                roomId = room.RoomCode,
                roomCode = room.RoomCode,
                roomName = room.RoomName,
                building = room.Building,
                floor = room.Floor,
                capacity = room.Capacity,
                occupiedSlots = activeBookings
                    .Where(b => b.RoomId == room.RoomId)
                    .Select(b => new
                    {
                        bookingId = b.BookingId,
                        startDateTime = b.StartDateTime,
                        endDateTime = b.EndDateTime,
                        startTime = b.StartDateTime.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm"),
                        endTime = b.EndDateTime.ToOffset(TimeSpan.FromHours(7)).ToString("HH:mm"),
                        isAllDay = b.IsAllDay,
                        status = b.Status
                    }).ToList()
            });

            return Ok(new
            {
                success = true,
                date = bookingDate.ToString("yyyy-MM-dd"),
                timeZone = "Asia/Jakarta",
                totalRooms = activeRooms.Count,
                rooms
            });
        }
    }
}
