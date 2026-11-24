
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { sendEmail } from "@/lib/email/transporter";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session || session.role !== "ADMIN") {
    return Response.json(
      { error: "Brak uprawnień." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const to = body.to;

    if (
      typeof to !== "string" ||
      to.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)
    ) {
      return Response.json(
        { error: "Nieprawidłowy adres e-mail." },
        { status: 400 }
      );
    }

    await sendEmail({
      to,
      subject: "Test wysyłania wiadomości - PCMaker",
      html: `
        <h2>Witaj!</h2>
        <p>To jest testowa wiadomość wysłana z aplikacji <strong>PCMaker</strong>.</p>
        <p>Jeżeli ją otrzymujesz, integracja SMTP działa poprawnie.</p>
      `,
    });

    return Response.json({
      success: true,
      message: "Wiadomosc zostala wyslana.",
    });
  } catch (error) {
    console.error("Email test error:", error);

    return Response.json(
      { error: "Nie udało się wysłać wiadomości." },
      { status: 500 }
    );
  }
}
