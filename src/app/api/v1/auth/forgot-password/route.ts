
import { createHash, randomBytes } from "crypto";
import { adminDataConnect } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email/transporter";

interface GetUserByEmailData {
  users: {
    id: string;
    email: string;
    isActive: boolean;
  }[];
}

interface GetUserByEmailVariables {
  email: string;
}

const TOKEN_EXPIRATION_HOURS = 1;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return entities[character];
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Podaj prawidłowy adres e-mail." },
        { status: 400 }
      );
    }

    const userResult = await adminDataConnect.executeQuery<
      GetUserByEmailData,
      GetUserByEmailVariables
    >("GetUserByEmail", { email });

    const user = userResult.data.users[0];

    if (user?.isActive) {
      const token = randomBytes(32).toString("hex");

      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      const expiresAt = new Date(
        Date.now() + TOKEN_EXPIRATION_HOURS * 60 * 60 * 1000
      ).toISOString();

      await adminDataConnect.executeMutation("CreateAuthToken", {
        userId: user.id,
        tokenHash,
        type: "PASSWORD_RESET",
        expiresAt,
      });

      const appUrl = process.env.APP_URL;

      if (!appUrl) {
        throw new Error("Missing APP_URL environment variable.");
      }

        const resetUrl = new URL("/", appUrl);
        resetUrl.searchParams.set("resetToken", token);

      await sendEmail({
        to: email,
        subject: "Resetowanie hasła | PCmaker",
        html: `
          <!DOCTYPE html>
          <html lang="pl">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Resetowanie hasła PCmaker</title>
            </head>

            <body style="margin:0; padding:40px 16px; background-color:#101112; font-family:Arial, Helvetica, sans-serif; color:#f4f4f5;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
                      style="max-width:560px; background-color:#191a1c; border:1px solid #303236; border-radius:12px; overflow:hidden;">

                      <tr>
                        <td style="padding:28px 36px; border-bottom:1px solid #303236;">
                          <span style="display:inline-block; padding:8px 10px; background-color:#dc2626; border-radius:6px; color:#ffffff; font-size:15px; font-weight:bold; letter-spacing:1px;">
                            PC
                          </span>
                          <span style="margin-left:8px; color:#f4f4f5; font-size:21px; font-weight:bold;">
                            PC<span style="color:#dc2626;">maker</span>
                          </span>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:40px 36px 20px;">
                          <p style="margin:0 0 14px; color:#dc2626; font-size:11px; font-weight:bold; letter-spacing:2px;">
                            PCMAKER / RESETOWANIE HASŁA
                          </p>

                          <h1 style="margin:0 0 20px; color:#ffffff; font-size:30px; line-height:1.2;">
                            Twój warsztat.<br />
                            <span style="color:#dc2626; font-style:italic;">Czeka.</span>
                          </h1>

                          <p style="margin:0 0 14px; color:#d1d5db; font-size:15px; line-height:1.7;">
                            Otrzymaliśmy prośbę o zmianę hasła do Twojego konta PCmaker.
                          </p>

                          <p style="margin:0 0 26px; color:#a1a1aa; font-size:14px; line-height:1.8;">
                            Kliknij poniższy przycisk, aby ustawić nowe hasło.
                            Jeśli nie wysyłałeś takiej prośby, zignoruj tę wiadomość.
                          </p>

                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td align="center" style="background-color:#dc2626; border-radius:6px;">
                                <a href="${escapeHtml(resetUrl.toString())}"
                                  style="display:inline-block; padding:15px 25px; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none;">
                                  Ustaw nowe hasło &nbsp; →
                                </a>
                              </td>
                            </tr>
                          </table>

                          <p style="margin:28px 0 8px; color:#71717a; font-size:12px; line-height:1.7;">
                            Link do zmiany hasła jest ważny przez 1 godzinę.
                          </p>
                        </td>
                      </tr>

                      <tr>
                        <td style="padding:22px 36px; border-top:1px solid #303236;">
                          <p style="margin:0 0 6px; color:#71717a; font-size:10px; font-weight:bold; letter-spacing:1.5px;">
                            PCMAKER · KONFIGURATOR I SERWIS SPRZĘTU
                          </p>
                          <p style="margin:0; color:#52525b; font-size:11px; line-height:1.6;">
                            Jeśli nie prosiłeś o zmianę hasła, zignoruj tę wiadomość.
                          </p>
                        </td>
                      </tr>

                    </table>
                  </td>
                </tr>
              </table>
            </body>
          </html>
        `,
      });
    }

    return Response.json({
      success: true,
      message:
        "Jeśli konto z podanym adresem istnieje, wysłaliśmy wiadomość z instrukcją resetowania hasła.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);

    return Response.json(
      { error: "Nie udało się przetworzyć żądania. Spróbuj ponownie później." },
      { status: 500 }
    );
  }
}
