import Link from "next/link";
import Image from "next/image";
import { Mail, Phone, MapPin } from "lucide-react";
import { backend } from "@/lib/backend";
import { getSocialLinks } from "@/lib/social-links";
import VisitorCount from "./VisitorCount";

function InstagramIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
    );
}

function FacebookIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
    );
}

function YouTubeIcon() {
    return (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
    );
}

export default async function StoreFooter() {
    // Categories are dynamic (every category shows here); contact details below
    // are intentionally hardcoded to the real business contact.
    const categories = (await backend.getCategories().catch(() => [])).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );

    const socialLinks = getSocialLinks().map((link) => ({
        ...link,
        icon:
            link.label === "Instagram"
                ? InstagramIcon
                : link.label === "Facebook"
                  ? FacebookIcon
                  : YouTubeIcon,
    }));

    return (
        <footer className="bg-brand-black text-white mt-20">
            {/* Top accent line */}
            <div className="h-0.5 bg-gradient-to-r from-brand-orange via-brand-orange/40 to-transparent" />

            <div className="max-w-380 mx-auto px-4 py-14">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {/* Brand */}
                    <div className="lg:col-span-1">
                        <div className="flex items-center gap-2.5 mb-3">
                            <Image src="/uploads/logo/logo.webp" alt="Veronica" width={36} height={36} className="rounded-lg" />
                            <div className="flex flex-col leading-none">
                                <span className="text-lg font-extrabold tracking-tight">VERONICA</span>
                                <span className="text-[9px] font-medium tracking-[0.2em] text-white/40 uppercase mt-0.5">
                                    Premium Sanitary
                                </span>
                            </div>
                        </div>
                        <p className="text-[13px] text-white/50 leading-relaxed mb-6">
                            Quality · Durability · Reliability
                            <br />
                            Premium home improvement &amp; sanitary solutions since 2004.
                        </p>
                        <div className="flex gap-3">
                            {socialLinks.length > 0 ? (
                                socialLinks.map((social) => (
                                    <a
                                        key={social.label}
                                        href={social.href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={social.label}
                                        className="w-9 h-9 rounded-lg bg-white/12 hover:bg-brand-orange flex items-center justify-center text-white/50 hover:text-white transition-all duration-200"
                                    >
                                        <social.icon />
                                    </a>
                                ))
                            ) : null}
                        </div>
                    </div>

                    {/* Shop Links */}
                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30 mb-5">
                            Shop
                        </h4>
                        <ul className="space-y-2.5">
                            {categories.map((cat) => (
                                <li key={cat.id}>
                                    <Link
                                        href={`/category/${cat.slug}`}
                                        className="text-[13px] text-white/50 hover:text-white transition-colors duration-200 hover:pl-1"
                                    >
                                        {cat.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Company Links */}
                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30 mb-5">
                            Company
                        </h4>
                        <ul className="space-y-2.5">
                            {[
                                { href: "/about", label: "About Us" },
                                { href: "/contact", label: "Contact Us" },
                                { href: "/faq", label: "FAQ" },
                                { href: "/shipping", label: "Shipping" },
                                { href: "/terms", label: "Terms of Service" },
                                { href: "/privacy", label: "Privacy Policy" },
                                { href: "/refund", label: "Refund Policy" },
                                { href: "/cart", label: "Your Cart" },
                            ].map((link) => (
                                <li key={link.href}>
                                    <Link
                                        href={link.href}
                                        className="text-[13px] text-white/50 hover:text-white transition-colors duration-200 hover:pl-1"
                                    >
                                        {link.label}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="text-[11px] font-bold uppercase tracking-[0.15em] text-white/30 mb-5">
                            Contact
                        </h4>
                        <div className="space-y-3 text-[13px] text-white/50">
                            <a href="mailto:veronicasanitarygoods@gmail.com" className="flex items-start gap-2.5 hover:text-white transition-colors duration-200">
                                <Mail size={15} className="mt-0.5 shrink-0" />
                                <span>veronicasanitarygoods@gmail.com</span>
                            </a>
                            <a href="tel:+919350529717" className="flex items-center gap-2.5 hover:text-white transition-colors duration-200">
                                <Phone size={15} className="shrink-0" />
                                <span>+91 93505 29717</span>
                            </a>
                            <div className="flex items-start gap-2.5">
                                <MapPin size={15} className="mt-0.5 shrink-0" />
                                <span>
                                    Plot 734, Bijwasan - Palam Vihar Rd,
                                    <br />
                                    New Delhi, 110061
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="border-t border-white/10 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
                    <p className="text-[11px] text-white/30">
                        © {new Date().getFullYear()} Veronica India. All rights reserved.
                    </p>
                    <VisitorCount />
                    <p className="text-[11px] text-white/20">
                        Crafted with care in New Delhi
                    </p>
                </div>
            </div>
        </footer>
    );
}
