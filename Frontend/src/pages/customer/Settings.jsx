import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import API from "../../../API/api.js";
import { toast } from "sonner";

const Settings = () => {
  const [settings, setSettings] = useState({
    name: "",
    email: "",
    phone: "",
    avatar: "",
  });

  const [passwords, setPasswords] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [preview, setPreview] = useState("");
  const [avatarFile, setAvatarFile] = useState(null);

  const fetchInfo = async () => {
    try {
      const response = await API.get("/settings");

      setSettings(response.data);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to load settings.");
    }
  };

  useEffect(() => {
    fetchInfo();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];

    if (!file) return;

    setAvatarFile(file);
    setPreview(URL.createObjectURL(file));
  };

  const handlePasswordChange = (e) => {
    setPasswords({
      ...passwords,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    try {
      if (
        passwords.newPassword &&
        passwords.newPassword !== passwords.confirmPassword
      ) {
        return toast.error("New passwords do not match.");
      }

      const formData = new FormData();

      formData.append("name", settings.name);
      formData.append("email", settings.email);
      formData.append("phone", settings.phone);

      if (avatarFile) {
        formData.append("avatar", avatarFile);
      }

      if (passwords.currentPassword) {
        formData.append("currentPassword", passwords.currentPassword);
      }

      if (passwords.newPassword) {
        formData.append("newPassword", passwords.newPassword);
      }

      const response = await API.put("/settings", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      setSettings(response.data);

      setPasswords({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setAvatarFile(null);
      setPreview("");

      toast.success("Profile updated successfully!");
    } catch (error) {
      toast.error(error.response?.data?.message || "Something went wrong.");
    }
  };

  return (
    <div
      className="
    min-h-screen
    bg-background
    px-4
    sm:px-6
    py-8
    sm:py-12
    "
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}

        <div>
          <h1
            className="
          text-3xl
          sm:text-4xl
          font-bold
          "
          >
            Settings
          </h1>

          <p
            className="
          text-muted-foreground
          mt-2
          "
          >
            Manage your account information and security.
          </p>
        </div>

        {/* Profile Section */}

        <div
          className="
        bg-card
        border
        rounded-3xl
        shadow-sm
        p-5
        sm:p-7
        space-y-5
        "
        >
          <h2
            className="
          text-xl
          sm:text-2xl
          font-bold
          "
          >
            Profile Information
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>

              <Input
                className="mt-2"
                placeholder="Name"
                value={settings.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    name: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Email</label>

              <Input
                className="mt-2"
                placeholder="Email"
                type="email"
                value={settings.email}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    email: e.target.value,
                  })
                }
              />
            </div>

            <div>
              <label className="text-sm font-medium">Phone</label>

              <Input
                className="mt-2"
                placeholder="Phone"
                value={settings.phone}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    phone: e.target.value,
                  })
                }
              />
            </div>
          </div>

          {/* Avatar */}

          <div
            className="
          border
          rounded-2xl
          p-4
          space-y-4
          "
          >
            <Field>
              <FieldLabel>Profile Picture</FieldLabel>

              <Input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="mt-2"
              />

              <FieldDescription>
                Upload a new image to update your profile picture.
              </FieldDescription>
            </Field>

            {(preview || settings.avatar) && (
              <img
                src={preview || settings.avatar}
                alt={settings.name}
                className="
              h-32
              w-32
              sm:h-40
              sm:w-40
              rounded-2xl
              object-cover
              border
              "
              />
            )}
          </div>
        </div>

        {/* Security Section */}

        <div
          className="
        bg-card
        border
        rounded-3xl
        shadow-sm
        p-5
        sm:p-7
        space-y-5
        "
        >
          <h2
            className="
          text-xl
          sm:text-2xl
          font-bold
          "
          >
            Security
          </h2>

          <Input
            type="password"
            name="currentPassword"
            placeholder="Current password"
            value={passwords.currentPassword}
            onChange={handlePasswordChange}
          />

          <Input
            type="password"
            name="newPassword"
            placeholder="New password"
            value={passwords.newPassword}
            onChange={handlePasswordChange}
          />

          <Input
            type="password"
            name="confirmPassword"
            placeholder="Confirm new password"
            value={passwords.confirmPassword}
            onChange={handlePasswordChange}
          />
        </div>

        {/* Save Button */}

        <button
          onClick={handleSave}
          className="
        w-full
        sm:w-auto
        bg-primary
        text-primary-foreground
        px-8
        py-3
        rounded-xl
        font-semibold
        hover:opacity-90
        transition
        "
        >
          Save Changes
        </button>
      </div>
    </div>
  );
};

export default Settings;
