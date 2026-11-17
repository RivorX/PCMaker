import { createUser } from "@pcmaker/dataconnect";
import { dataConnect } from "@/lib/firebase";
import bcrypt from "bcryptjs";

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
        { error: "Uzupełnij wszystkie wymagane pola." },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json(
        { error: "Podaj prawidłowy adres e-mail." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return Response.json(
        { error: "Hasło musi mieć minimum 8 znaków." },
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

    return Response.json(
      {
        success: true,
        message: "Konto zostało utworzone.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Błąd rejestracji:", error);

    return Response.json(
      {
        error:
          "Nie udało się utworzyć konta. Sprawdź, czy adres e-mail nie jest już zajęty.",
      },
      { status: 400 }
    );
  }
}