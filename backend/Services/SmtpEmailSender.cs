using System.Net;
using System.Net.Mail;
using System.Text;

namespace BIRAMA.API.Services;

public sealed class SmtpEmailSender : IEmailSender
{
    private readonly IConfiguration _config;
    private readonly IHostEnvironment _env;
    private readonly ILogger<SmtpEmailSender> _logger;

    public SmtpEmailSender(IConfiguration config, IHostEnvironment env, ILogger<SmtpEmailSender> logger)
    { _config = config; _env = env; _logger = logger; }

    public async Task SendAsync(string toEmail, string subject, string htmlBody, string actionLink)
    {
        var host = _config["Email:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            // Tautan hanya boleh muncul di log saat Development. Di luar itu, konfigurasi wajib diisi.
            if (_env.IsDevelopment())
            {
                _logger.LogWarning("Email:Host belum diisi, email tidak dikirim (Development). Kepada: {To} | Subjek: {Subject} | Tautan: {Link}", toEmail, subject, actionLink);
                return;
            }
            throw new InvalidOperationException("Konfigurasi Email:Host wajib diisi.");
        }

        var fromAddress = _config["Email:FromAddress"] ?? throw new InvalidOperationException("Konfigurasi Email:FromAddress wajib diisi.");
        var port = _config.GetValue<int?>("Email:Port") ?? 587;
        var enableSsl = _config.GetValue<bool?>("Email:EnableSsl") ?? true;

        using var message = new MailMessage
        {
            From = new MailAddress(fromAddress, _config["Email:FromName"] ?? "BIRAMA"),
            Subject = subject,
            SubjectEncoding = Encoding.UTF8,
            Body = htmlBody,
            BodyEncoding = Encoding.UTF8,
            IsBodyHtml = true
        };
        message.To.Add(toEmail);

        using var client = new SmtpClient(host, port) { EnableSsl = enableSsl, Timeout = 15000 };
        var username = _config["Email:Username"];
        if (!string.IsNullOrWhiteSpace(username))
            client.Credentials = new NetworkCredential(username, _config["Email:Password"]);

        await client.SendMailAsync(message);
    }
}
