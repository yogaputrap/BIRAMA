using System.Net;

namespace BIRAMA.API.Services;

public static class AuthEmailTemplates
{
    public static (string Subject, string Html) VerifyEmail(string name, string link) => (
        "Verifikasi email akun BIRAMA",
        Layout(name,
            "Terima kasih telah mendaftar di BIRAMA. Klik tombol di bawah untuk memverifikasi alamat email Anda.",
            "Verifikasi Email", link,
            "Tautan berlaku 24 jam. Jika Anda tidak merasa mendaftar di BIRAMA, abaikan email ini."));

    public static (string Subject, string Html) ResetPassword(string name, string link) => (
        "Reset kata sandi akun BIRAMA",
        Layout(name,
            "Kami menerima permintaan untuk mereset kata sandi akun BIRAMA Anda. Klik tombol di bawah untuk membuat kata sandi baru.",
            "Reset Kata Sandi", link,
            "Tautan berlaku 1 jam dan hanya dapat dipakai sekali. Jika Anda tidak meminta reset, abaikan email ini; kata sandi Anda tidak berubah."));

    private static string Layout(string name, string intro, string button, string link, string footer)
    {
        var n = WebUtility.HtmlEncode(name);
        var l = WebUtility.HtmlEncode(link);
        return $@"<div style=""font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1e293b"">
  <h2 style=""margin:0 0 16px"">BIRAMA</h2>
  <p>Halo {n},</p>
  <p>{intro}</p>
  <p style=""margin:24px 0""><a href=""{l}"" style=""background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold"">{button}</a></p>
  <p style=""font-size:12px;color:#64748b"">Jika tombol tidak berfungsi, salin tautan ini ke browser:<br>{l}</p>
  <p style=""font-size:12px;color:#64748b"">{footer}</p>
</div>";
    }
}
