import LoginForm from "@/app/components/login-form";
import { createClient } from "@/app/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

const Login = async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  console.log("data", data);
  if (data?.claims) redirect("/");

  return (
    <main className="p-6 min-h-dvh w-full flex justify-center items-center bg-gray-100">
      <section className="p-6 max-w-md w-full bg-white rounded-2xl shadow-md">
        <div className="mb-3">
          <Link
            href={"/"}
            className="text-white bg-primary px-4 py-2 rounded-md"
          >
            Sawadika
          </Link>
        </div>
        <h1 className="text-xl font-semibold mb-2">
          Welcome to Workspace Chat
        </h1>
        <LoginForm />
      </section>
    </main>
  );
};

export default Login;
