namespace BIRAMA.API.DTOs;

public class AdminGrantRequest
{
    public string Email { get; set; } = string.Empty;
    public string GrantedBy { get; set; } = string.Empty;
}
