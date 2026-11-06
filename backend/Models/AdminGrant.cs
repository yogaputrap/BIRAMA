namespace BIRAMA.API.Models;

// Email yang diberi hak admin dapat disimpan meskipun akun belum mendaftar.
public class AdminGrant
{
    public string Email { get; set; } = string.Empty;
    public string GrantedBy { get; set; } = string.Empty;
    public DateTimeOffset GrantedAt { get; set; }
}
