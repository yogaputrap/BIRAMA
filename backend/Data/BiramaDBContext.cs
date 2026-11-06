using BIRAMA.API.Models;
using Microsoft.EntityFrameworkCore;

namespace BIRAMA.API.Data;

public class BiramaDbContext : DbContext
{
    public BiramaDbContext(DbContextOptions<BiramaDbContext> options) : base(options) { }

    public DbSet<Room> Rooms => Set<Room>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<BookingStatusLog> BookingStatusLogs => Set<BookingStatusLog>();
    public DbSet<PICMonitoring> PICMonitorings => Set<PICMonitoring>();
    public DbSet<SystemConfiguration> SystemConfigurations => Set<SystemConfiguration>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();
    public DbSet<AdminGrant> AdminGrants => Set<AdminGrant>();
    public DbSet<AuthToken> AuthTokens => Set<AuthToken>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Room>(entity =>
        {
            entity.ToTable("Room");
            entity.HasKey(x => x.RoomId);
            entity.Property(x => x.RoomCode).HasMaxLength(20).IsRequired();
            entity.Property(x => x.RoomName).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Building).HasMaxLength(100).IsRequired();
            entity.Property(x => x.Floor).IsRequired();
            entity.Property(x => x.Capacity);
            entity.Property(x => x.PhotoUrl).HasMaxLength(500);
            entity.Property(x => x.IsActive).IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
        });

        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.ToTable("UserAccount");
            entity.HasKey(x => x.UserId);
            entity.Property(x => x.Name).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(254).IsRequired();
            entity.HasIndex(x => x.Email).IsUnique().HasDatabaseName("UX_UserAccount_Email");
            entity.Property(x => x.PasswordHash).HasMaxLength(500);
            entity.Property(x => x.Role).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Provider).HasMaxLength(20).IsRequired();
            entity.Property(x => x.Satker).HasMaxLength(200);
            entity.Property(x => x.Phone).HasMaxLength(50);
            entity.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.RoleChangedBy).HasMaxLength(254);
            entity.Property(x => x.RoleChangedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.EmailVerified).IsRequired();
            entity.Property(x => x.EmailVerifiedAt).HasColumnType("datetimeoffset");
        });

        modelBuilder.Entity<AuthToken>(entity =>
        {
            entity.ToTable("AuthToken");
            entity.HasKey(x => x.TokenId);
            entity.Property(x => x.Purpose).HasMaxLength(30).IsRequired();
            entity.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.ExpiresAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.UsedAt).HasColumnType("datetimeoffset");
            entity.HasIndex(x => x.TokenHash).IsUnique().HasDatabaseName("UX_AuthToken_TokenHash");
            entity.HasIndex(x => new { x.UserId, x.Purpose }).HasDatabaseName("IX_AuthToken_User_Purpose");
            entity.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AdminGrant>(entity =>
        {
            entity.ToTable("AdminGrant");
            entity.HasKey(x => x.Email);
            entity.Property(x => x.Email).HasMaxLength(254).IsRequired();
            entity.Property(x => x.GrantedBy).HasMaxLength(254).IsRequired();
            entity.Property(x => x.GrantedAt).HasColumnType("datetimeoffset");
        });

        modelBuilder.Entity<Booking>(entity =>
        {
            entity.ToTable("Booking");
            entity.HasKey(x => x.BookingId);
            entity.Property(x => x.BookingNumber).HasMaxLength(60);
            entity.Property(x => x.PICEmail).HasMaxLength(254);
            entity.Property(x => x.StartDateTime).HasColumnType("datetimeoffset");
            entity.Property(x => x.EndDateTime).HasColumnType("datetimeoffset");
            entity.Property(x => x.EventName).HasMaxLength(200).IsRequired();
            entity.Property(x => x.Layout).HasMaxLength(100);
            entity.Property(x => x.Institution).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ApplicantName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.PICName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.PICContact).HasMaxLength(50).IsRequired();
            entity.Property(x => x.ApplicantEmail).HasMaxLength(254).IsRequired();
            entity.Property(x => x.CancellationTokenHash).HasMaxLength(256);
            entity.Property(x => x.Status).HasMaxLength(20);
            entity.Property(x => x.RejectionReason).HasMaxLength(1000);
            entity.Property(x => x.SubmittedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.UpdatedAt).HasColumnType("datetimeoffset");
            entity.HasIndex(x => x.OwnerUserId).HasDatabaseName("IX_Booking_OwnerUserId");
            entity.HasOne(x => x.Room).WithMany(x => x.Bookings).HasForeignKey(x => x.RoomId).OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.OwnerUser).WithMany(x => x.Bookings).HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<BookingStatusLog>(entity =>
        {
            entity.ToTable("Booking_Status_Log");
            entity.HasKey(x => x.LogId);
            entity.Property(x => x.OldStatus).HasMaxLength(20);
            entity.Property(x => x.NewStatus).HasMaxLength(20).IsRequired();
            entity.Property(x => x.ChangedBy).HasMaxLength(200).IsRequired();
            entity.Property(x => x.ChangedAt).HasColumnType("datetimeoffset");
            entity.Property(x => x.Notes).HasMaxLength(1000);
            entity.HasOne(x => x.Booking).WithMany(x => x.StatusLogs).HasForeignKey(x => x.BookingId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<PICMonitoring>(entity =>
        {
            entity.ToTable("PIC_Monitoring");
            entity.HasKey(x => x.PICId);
            entity.Property(x => x.FullName).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Uker).HasMaxLength(150).IsRequired();
            entity.Property(x => x.Email).HasMaxLength(254).IsRequired();
            entity.Property(x => x.IsActive).IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnType("datetimeoffset");
        });

        modelBuilder.Entity<SystemConfiguration>(entity =>
        {
            entity.ToTable("System_Configuration");
            entity.HasKey(x => x.ConfigKey);
            entity.Property(x => x.ConfigKey).HasMaxLength(100).IsRequired();
            entity.Property(x => x.ConfigValue).HasMaxLength(500).IsRequired();
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.Property(x => x.UpdatedAt).HasColumnType("datetimeoffset");
        });
    }
}
