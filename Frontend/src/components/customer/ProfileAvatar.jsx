import { useState } from "react";

const LEGACY_DEFAULT_AVATAR = "https://res.cloudinary.com/xqjlg4ei/image/upload/v1782918066/Sample_User_Icon_yqt0wv.png";

const ProfileAvatar = ({ src, alt = "Profile", className = "" }) => {
  const [failedSource, setFailedSource] = useState(null);
  const showFallback = !src || src === LEGACY_DEFAULT_AVATAR || failedSource === src;
  return (
    <span className={"inline-flex shrink-0 items-center justify-center overflow-hidden bg-muted " + className}>
      {showFallback ? (
        <svg viewBox="0 0 100 100" role="img" aria-label={alt} className="size-full text-muted-foreground" focusable="false">
          <circle cx="50" cy="50" r="50" fill="currentColor" opacity=".12" />
          <circle cx="50" cy="38" r="17" fill="currentColor" opacity=".68" />
          <path d="M18 91c2-19 15-31 32-31s30 12 32 31a48 48 0 0 1-64 0Z" fill="currentColor" opacity=".68" />
          <path d="M37 68c4 4 8 6 13 6s9-2 13-6l8 7c-5 10-12 15-21 15s-16-5-21-15z" fill="currentColor" opacity=".24" />
        </svg>
      ) : (
        <img src={src} alt={alt} className="size-full object-cover" onError={() => setFailedSource(src)} />
      )}
    </span>
  );
};

export default ProfileAvatar;