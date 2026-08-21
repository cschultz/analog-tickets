import { AdminAvatar } from "@/components/admin";

interface EmailAvatarProps {
  name: string;
  email?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const EmailAvatar = ({ name, size = "md", className }: EmailAvatarProps) => {
  return (
    <AdminAvatar 
      name={name} 
      size={size} 
      className={className}
    />
  );
};
