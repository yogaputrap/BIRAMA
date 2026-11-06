namespace BIRAMA.API.Services;

public interface IEmailSender
{
    /// <param name="actionLink">Hanya dipakai untuk log pada mode Development saat SMTP belum dikonfigurasi.</param>
    Task SendAsync(string toEmail, string subject, string htmlBody, string actionLink);
}
