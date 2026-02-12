export function Footer() {
  return (
    <footer className="border-t border-[#2a2a2a] bg-[#191919]">
      <div className="container mx-auto flex h-14 items-center justify-center px-4">
        <p className="text-sm text-neutral-500">
          &copy; {new Date().getFullYear()} RetailZero. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
