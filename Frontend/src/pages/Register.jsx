import { useEffect, useState } from "react";
import API from "../../API/api.js";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import ThemeToggle from "../components/ThemeToggle";
const Register = ({ user, setUser }) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
  });

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      setError("");

      if (!form.name || !form.email || !form.password) {
        setError("Please fill in all fields");
        return;
      }

      setLoading(true);

      const res = await API.post("/auth/register", form);

      setUser(res.data.user);

      navigate("/");
    } catch (error) {
      setError(
        error.response?.data?.message ||
          "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
    min-h-screen
    bg-background
    flex
    items-center
    justify-center
    px-4
    sm:px-6
    "
    >
      <ThemeToggle className="fixed right-4 top-4 z-50" />
      <div
        className="
      w-full
      max-w-md
      bg-card
      border
      rounded-3xl
      shadow-sm
      p-6
      sm:p-8
      "
      >
        {/* Back Button */}

        <button
          type="button"
          onClick={() => navigate("/")}
          className="
        flex
        items-center
        gap-2
        text-muted-foreground
        hover:text-primary
        transition
        mb-8
        "
        >
          ← Go back
        </button>

        {/* Header */}

        <div className="text-center mb-8">
          <div
            className="
          mx-auto
          w-14
          h-14
          rounded-2xl
          bg-primary
          text-primary-foreground
          flex
          items-center
          justify-center
          font-bold
          text-xl
          mb-5
          "
          >
            E
          </div>

          <h1
            className="
          text-3xl
          font-bold
          text-foreground
          "
          >
            Create Account
          </h1>

          <p
            className="
          text-muted-foreground
          mt-2
          "
          >
            Join EthioShopping today
          </p>
        </div>

        {error && (
          <div
            className="
          bg-red-50
          text-red-600
          border
          border-red-200
          px-4
          py-3
          rounded-xl
          mb-5
          text-sm
          "
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="register-name" className="text-sm font-medium">Full Name</label>

            <input
              type="text"
              id="register-name"
              placeholder="Enter your name"
              value={form.name}
              onChange={(e) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              className="
            mt-2
            w-full
            border
            rounded-xl
            px-4
            py-3
            bg-background
            outline-none
            focus:ring-2
            focus:ring-primary
            "
            />
          </div>

          <div>
            <label htmlFor="register-email" className="text-sm font-medium">Email</label>

            <input
              type="email"
              id="register-email"
              placeholder="Enter your email"
              value={form.email}
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
              className="
            mt-2
            w-full
            border
            rounded-xl
            px-4
            py-3
            bg-background
            outline-none
            focus:ring-2
            focus:ring-primary
            "
            />
          </div>

          <div>
            <label htmlFor="register-password" className="text-sm font-medium">Password</label>

            <input
              type="password"
              id="register-password"
              placeholder="Create a password"
              value={form.password}
              onChange={(e) =>
                setForm({
                  ...form,
                  password: e.target.value,
                })
              }
              className="
            mt-2
            w-full
            border
            rounded-xl
            px-4
            py-3
            bg-background
            outline-none
            focus:ring-2
            focus:ring-primary
            "
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="register-phone" className="text-sm font-medium">Phone Number</label>

              <span className="text-xs text-muted-foreground italic">
                Optional
              </span>
            </div>

            <input
              type="tel"
              id="register-phone"
              placeholder="Enter phone number"
              value={form.phone}
              onChange={(e) =>
                setForm({
                  ...form,
                  phone: e.target.value,
                })
              }
              className="
      mt-2
      w-full
      rounded-xl
      border
      bg-background
      px-4
      py-3
      outline-none
      focus:ring-2
      focus:ring-primary
    "
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="
          w-full
          bg-primary
          hover:opacity-90
          text-primary-foreground
          h-12
          rounded-xl
          font-semibold
          transition
          disabled:opacity-50
          "
          >
            {loading ? "Creating account..." : "Register"}
          </button>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <GoogleLogin
            size="large"
            shape="pill"
            width="400"
            text="continue_with"
            theme="outline"
            logo_alignment="center"
            onSuccess={async (credentialResponse) => {
              try {
                const res = await API.post("/auth/google", {
                  token: credentialResponse.credential,
                });

                setUser(res.data.user);
                navigate("/");
              } catch (error) {
                console.log(error.response?.data?.msg || "Google login failed");
              }
            }}
            onError={() => {
              console.log("Google Login Failed");
            }}
          />
        </form>

        <p
          className="
        text-center
        text-sm
        text-muted-foreground
        mt-6
        "
        >
          Already have an account?
          <Link
            to="/login"
            className="
          text-primary
          font-medium
          ml-1
          underline-offset-4
          hover:underline
          focus-visible:outline-none
          focus-visible:ring-2
          focus-visible:ring-ring
          "
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
