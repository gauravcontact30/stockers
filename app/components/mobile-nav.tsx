"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type NavLink = { href: string; label: string };

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = open && (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
      />
      <div className="absolute top-0 right-0 flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-5 shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">Menu</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation menu"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="mt-4 flex flex-col gap-1">
          {links.map((link) => {
            // Same-page anchors stay plain <a> so the browser handles smooth scrolling; links to
            // another route go through Link for client-side navigation.
            const NavTag = link.href.startsWith("/") ? Link : "a";
            return (
              <NavTag
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-emerald-600 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-emerald-400"
              >
                {link.label}
              </NavTag>
            );
          })}
        </nav>

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <Link
            href="/signin"
            onClick={() => setOpen(false)}
            className="rounded-full border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            onClick={() => setOpen(false)}
            className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-center text-sm font-semibold text-white transition hover:from-emerald-500 hover:to-teal-500"
          >
            Get started
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-300 hover:text-emerald-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-emerald-500/40 dark:hover:text-emerald-400"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {mounted && createPortal(drawer, document.body)}
    </div>
  );
}
