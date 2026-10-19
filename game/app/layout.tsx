export const metadata = { title: "Blotty" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Georgia, serif", background: "#fbf8ef", color: "#222", margin: 24 }}>{children}</body>
    </html>
  );
}
