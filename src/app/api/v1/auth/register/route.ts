
import { createHash, randomBytes } from "crypto";
import { createUser } from "@pcmaker/dataconnect";
import { dataConnect } from "@/lib/firebase";
import { adminDataConnect } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email/transporter";
import bcrypt from "bcryptjs";

interface GetUserByEmailData {
  users: {
    id: string;
    email: string;
  }[];
}

interface GetUserByEmailVariables {
  email: string;
}

const TOKEN_EXPIRATION_HOURS = 24;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const firstName =
      typeof body.firstName === "string" ? body.firstName.trim() : "";

    const lastName =
      typeof body.lastName === "string" ? body.lastName.trim() : "";

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string" ? body.password : "";

    const phone =
      typeof body.phone === "string" ? body.phone.trim() : null;

    if (!firstName || !lastName || !email || !password) {
      return Response.json(
        { error: "Uzupelnij wszystkie wymagane pola." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Podaj prawidlowy adres e-mail." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Haslo musi miec minimum 8 znakow." },
        { status: 400 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await createUser(dataConnect, {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phone: phone || undefined,
    });

    const userResult = await adminDataConnect.executeQuery<
      GetUserByEmailData,
      GetUserByEmailVariables
    >("GetUserByEmail", { email });

    const user = userResult.data.users[0];

    if (!user) {
      throw new Error("Nie znaleziono utworzonego uzytkownika.");
    }

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
      type: "ACTIVATION",
      expiresAt,
    });

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

    const activationUrl =
      `${process.env.APP_URL}/api/v1/auth/activate?token=${encodeURIComponent(token)}`;


    await sendEmail({
      to: email,
      subject: "Aktywuj swoje konto | PCmaker",
      html: `
        <!DOCTYPE html>
        <html lang="pl">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Aktywacja konta PCmaker</title>
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
                          PCMAKER / AKTYWACJA KONTA
                        </p>

                        <h1 style="margin:0 0 20px; color:#ffffff; font-size:30px; line-height:1.2;">
                          Twój warsztat.<br />
                          <span style="color:#dc2626; font-style:italic;">Czeka.</span>
                        </h1>

                        <p style="margin:0 0 14px; color:#d1d5db; font-size:15px; line-height:1.7;">
                          Cześć ${escapeHtml(firstName)},
                        </p>

                        <p style="margin:0 0 26px; color:#a1a1aa; font-size:14px; line-height:1.8;">
                          Dziękujemy za utworzenie konta w PCmaker.
                          Aby zakończyć rejestrację i uzyskać dostęp do swojego warsztatu,
                          potwierdź swój adres e-mail, klikając poniższy przycisk.
                        </p>

                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                          <tr>
                            <td align="center" style="background-color:#dc2626; border-radius:6px;">
                              <a href="${activationUrl}"
                                style="display:inline-block; padding:15px 25px; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none;">
                                Aktywuj konto &nbsp; →
                              </a>
                            </td>
                          </tr>
                        </table>

                        <p style="margin:28px 0 8px; color:#71717a; font-size:12px; line-height:1.7;">
                          Link aktywacyjny jest ważny przez 24 godziny.
                        </p>
                      </td>
                    </tr>

                    <tr>
                      <td style="padding:22px 36px; border-top:1px solid #303236;">
                        <p style="margin:0 0 6px; color:#71717a; font-size:10px; font-weight:bold; letter-spacing:1.5px;">
                          PCMAKER · KONFIGURATOR I SERWIS SPRZĘTU
                        </p>
                        <p style="margin:0; color:#52525b; font-size:11px; line-height:1.6;">
                          Jeśli nie zakładałeś konta w PCmaker, zignoruj tę wiadomość.
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


    return Response.json(
      {
        success: true,
        message: "Konto utworzono. Sprawdz poczte, aby je aktywowac.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);

    return Response.json(
      {
        error:
          "Nie udalo sie utworzyc konta. Sprawdz, czy adres e-mail nie jest juz zajety.",
      },
      { status: 400 }
    );
  }
}
