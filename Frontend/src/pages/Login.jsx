import { useEffect, useState } from "react";
import API from "../../API/api.js";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleLogin } from "@react-oauth/google";
import ThemeToggle from "../components/ThemeToggle";
import { getPostLoginDestination } from "./driverRouting.js";

const Login = ({ user, setUser }) => {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  useEffect(() => {
    if (user) {
      navigate(getPostLoginDestination(user), { replace: true });
    }
  }, [user, navigate]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      if (!form.email || !form.password) {
        setError("Please fill in all fields");
        return;
      }
      setLoading(true);
      const res = await API.post("/auth/login", form);
      setUser(res.data.user);
      navigate(getPostLoginDestination(res.data.user), { replace: true });
    } catch (error) {
      setError(
        error.response?.data?.message || "Login failed. Please try again.",
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
          onClick={() => navigate(-1)}
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
            Welcome Back
          </h1>

          <p
            className="
          text-muted-foreground
          mt-2
          "
          >
            Login to continue shopping
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
            <Label htmlFor="login-email">Email</Label>

            <Input
              type="email"
              id="login-email"
              placeholder="Enter your email"
              value={form.email}
              className="
            mt-2
            rounded-xl
            "
              onChange={(e) =>
                setForm({
                  ...form,
                  email: e.target.value,
                })
              }
            />
          </div>

          <div>
            <Label htmlFor="login-password">Password</Label>

            <Input
              type="password"
              id="login-password"
              placeholder="Enter your password"
              value={form.password}
              className="
            mt-2
            rounded-xl
            "
              onChange={(e) =>
                setForm({
                  ...form,
                  password: e.target.value,
                })
              }
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="
          w-full
          h-12
          rounded-xl
          text-base
          "
          >
            {loading ? "Logging in..." : "Login"}
          </Button>
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
                navigate(getPostLoginDestination(res.data.user), { replace: true });
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
          Don't have an account?
          <Link
            to="/register"
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
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};
export default Login;
