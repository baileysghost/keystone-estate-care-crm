import "./style.css";
export const metadata = {
  title: "Keystone Estate Care | Employee workspace",
  icons: { icon: "/brand/icon.webp" },
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
