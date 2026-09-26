"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { navigation, type NavLink } from "@/config/navigation";

function linkIsActive(pathname: string, href: string) {
  return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function linkClass(active: boolean, nested = false) {
  return `block rounded-xl ${nested ? "px-4 py-2.5" : "px-4 py-3"} text-sm font-medium transition ${
    active
      ? "bg-white text-[var(--ph-green-dark)] shadow-sm"
      : "text-white/85 hover:bg-white/10 hover:text-white"
  }`;
}

function NavigationLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return navigation.map((item) => {
    if ("href" in item) {
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={linkIsActive(pathname, item.href) ? "page" : undefined}
          className={linkClass(linkIsActive(pathname, item.href))}
        >
          {item.label}
        </Link>
      );
    }

    const groupActive = item.children.some((child: NavLink) =>
      linkIsActive(pathname, child.href)
    );
    return (
      <details key={item.label} className="group" open={groupActive || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white">
          <span>{item.label}</span>
          <span
            aria-hidden="true"
            className="text-xs transition-transform group-open:rotate-180"
          >
            ▼
          </span>
        </summary>
        <div className="ml-3 mt-1 space-y-1 border-l border-white/20 pl-3">
          {item.children.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              aria-current={linkIsActive(pathname, child.href) ? "page" : undefined}
              className={linkClass(linkIsActive(pathname, child.href), true)}
            >
              {child.label}
            </Link>
          ))}
        </div>
      </details>
    );
  });
}

function SidebarFooter() {
  return (
    <div className="border-t border-white/10 p-4">
      <div className="rounded-xl bg-white/5 px-4 py-3">
        <div className="font-semibold">Palmenheld GmbH</div>
        <div className="text-sm text-white/70">Nordkirchen</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  return (
    <>
      <aside className="hidden min-h-screen w-72 shrink-0 bg-[var(--ph-green-dark)] text-white lg:flex lg:flex-col">
        <div className="bg-white px-5 py-5">
          <Image
            src="/logo-palmenheld.png"
            alt="Palmenheld"
            width={230}
            height={130}
            priority
            className="h-auto w-full"
          />
        </div>
        <nav className="flex-1 space-y-1 p-4" aria-label="Hauptnavigation">
          <NavigationLinks pathname={pathname} />
        </nav>
        <SidebarFooter />
      </aside>

      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Menü öffnen"
          aria-expanded={mobileOpen}
          aria-controls="mobile-navigation"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-2xl text-[var(--ph-green-dark)]"
        >
          ☰
        </button>
        <Image
          src="/logo-palmenheld.png"
          alt="Palmenheld"
          width={170}
          height={96}
          priority
          className="h-11 w-auto"
        />
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ph-green-light)] text-sm font-bold text-[var(--ph-green-dark)]">
          TW
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Menü schließen"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-950/55"
          />
          <aside
            id="mobile-navigation"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="relative flex h-full w-[min(21rem,88vw)] flex-col bg-[var(--ph-green-dark)] text-white shadow-2xl"
          >
            <div className="flex items-center justify-between bg-white px-4 py-3">
              <Image
                src="/logo-palmenheld.png"
                alt="Palmenheld"
                width={190}
                height={108}
                className="h-12 w-auto"
              />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Menü schließen"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300 text-2xl text-slate-700"
              >
                ×
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4" aria-label="Mobile Hauptnavigation">
              <NavigationLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            </nav>
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
