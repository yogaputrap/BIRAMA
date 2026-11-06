using BIRAMA.API.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BIRAMA.API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RoomsController : ControllerBase
    {
        private readonly BiramaDbContext _context;

        public RoomsController(BiramaDbContext context)
        {
            _context = context;
        }

        // GET: api/rooms
        [HttpGet]
        public async Task<IActionResult> GetRooms()
        {
            var rooms = await _context.Rooms
                .Where(r => r.IsActive)
                .OrderBy(r => r.RoomName)
                .Select(r => new
                {
                    r.RoomId,
                    r.RoomCode,
                    r.RoomName,
                    r.Building,
                    r.Floor,
                    r.Capacity,
                    r.PhotoUrl
                })
                .ToListAsync();

            return Ok(rooms);
        }

        // GET: api/rooms/{id}
        [HttpGet("{id:guid}")]
        public async Task<IActionResult> GetRoom(Guid id)
        {
            var room = await _context.Rooms
                .Where(r => r.RoomId == id && r.IsActive)
                .Select(r => new
                {
                    r.RoomId,
                    r.RoomCode,
                    r.RoomName,
                    r.Building,
                    r.Floor,
                    r.Capacity,
                    r.PhotoUrl
                })
                .FirstOrDefaultAsync();

            if (room == null)
            {
                return NotFound(new
                {
                    message = "Room not found."
                });
            }

            return Ok(room);
        }
    }
}