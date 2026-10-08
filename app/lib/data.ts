import {
  Package,
  Heart,
  Shield,
  Link2,
  Bell,
  Settings,
  HelpCircle,
  LogOut,
  Globe,
  Moon,
  Trash2,
  KeyRound,
  Mail,
  Smartphone,
  Phone,
  Headphones,
  MessageCircle,
  ArrowRight,
  RefreshCw,
  PlusSquare,
  ImageIcon,
  Clock,
  Database,
  FileText,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Main Profile Menu
───────────────────────────────────────────── */
export const profileMenuGroups = [
  {
    title: "Quick Access",
    items: [
      { icon: Package, label: "My Orders", description: "Track and manage your purchases", href: "/checkout" },
      { icon: Heart, label: "Wishlist", description: "Your saved items", href: "/cart" },
      { icon: Shield, label: "Account Security", description: "Manage passwords and verification", href: "/profile/account_security" },
      { icon: Link2, label: "Sellers page", description: "Go to sellers page", href: "/sellers" },
    ],
  },
  {
    title: "Settings",
    items: [
      { icon: Bell, label: "Notifications", description: "Manage notification preferences", href: "/profile/notifications" },
      { icon: Settings, label: "Settings", description: "General app settings", href: "/profile/settings" },
      { icon: HelpCircle, label: "Help & Support", description: "FAQs and contact support", href: "/profile/help" },
    ],
  },
];

/* ─────────────────────────────────────────────
   Settings Hub Menu
───────────────────────────────────────────── */
export const settingGroups = [
  {
    title: "Preferences",
    items: [
      {
        icon: Globe,
        label: "Language",
        description: "English (US)",
        href: "/profile/settings/language",
      },
      {
        icon: Moon,
        label: "Dark Mode",
        description: "Off",
        href: "/profile/settings/dark_mode",
      },
    ],
  },
  {
    title: "App Data",
    items: [
      {
        icon: Trash2,
        label: "Clear Cache",
        description: "Free up storage space",
        href: "/profile/settings/clear_cache",
      },
    ],
  },
];

/* ─────────────────────────────────────────────
   Account Security Menu
───────────────────────────────────────────── */
export const loginItems = [
  {
    icon: KeyRound,
    label: "Change Password",
    description: "Update your current password",
    href: "/profile/account_security/change_password",
  },
];

export const verificationItems = [
  {
    icon: Mail,
    label: "Email Verification",
    status: "verified",
    statusText: "Verified ✓",
    href: "/profile/account_security/email_verification",
  },
  {
    icon: Smartphone,
    label: "Phone Verification",
    status: "unverified",
    statusText: "Not verified — Verify now",
    href: "/profile/account_security/phone_verification",
  },
];

/* ─────────────────────────────────────────────
   Help & Support Data
───────────────────────────────────────────── */
export const quickHelp = [
  {
    icon: HelpCircle,
    label: "FAQ",
    description: "Find answers to common questions",
    href: "/profile/help/faq",
  },
  {
    icon: Mail,
    label: "Email Support",
    description: "Get a response within 24 hours",
    href: "/profile/help/email_support",
  },
  {
    icon: Phone,
    label: "Call Us",
    description: "Mon–Fri, 8:00 AM – 6:00 PM",
    href: "/profile/help/call_us",
  },
];

export const phoneLines = [
  {
    icon: Headphones,
    label: "General Support",
    number: "+234 800 123 4567",
    tel: "tel:+2348001234567",
    iconBg: "bg-orange-100",
    iconColor: "text-main",
    numColor: "text-main",
  },
  {
    icon: Phone,
    label: "Sellers Helpline",
    number: "+234 800 765 4321",
    tel: "tel:+2348007654321",
    iconBg: "bg-orange-100",
    iconColor: "text-main",
    numColor: "text-main",
  },
  {
    icon: MessageCircle,
    label: "WhatsApp Support",
    number: "+234 800 765 4321",
    tel: "https://wa.me/2348007654321",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    numColor: "text-green-600",
  },
];

export const faqCategories = ["All", "Orders", "Payments", "Returns", "Account"];

export const faqs = [
  {
    category: "Orders",
    q: "How do I track my order?",
    a: "You can track your order by going to 'My Orders' and tapping on the active order. A live status will be shown.",
  },
  {
    category: "Returns",
    q: "What is the return policy?",
    a: "Returns are accepted within 24 hours of pickup if the item does not match the description.",
  },
  {
    category: "Payments",
    q: "How does escrow work?",
    a: "We hold your payment securely until you confirm you have received the item. Once confirmed, the seller gets paid.",
  },
  {
    category: "Account",
    q: "How do I become a seller?",
    a: "Go to your profile, tap 'Become a Seller', and verify your student status to start selling.",
  },
];

/* ─────────────────────────────────────────────
   Report a Problem Data
───────────────────────────────────────────── */
export const problemTypes = [
  "App crash / Bug",
  "Payment failed",
  "Order not received",
  "Incorrect product listing",
  "Account access issue",
  "Seller misconduct",
  "Other",
];

export const screenOptions = [
  "Home screen",
  "Product listing",
  "Cart / Checkout",
  "Order tracking",
  "Profile / Account",
  "Search",
  "Other",
];

/* ─────────────────────────────────────────────
   Account Security Data
───────────────────────────────────────────── */
// Mirrors the API password policy (lib/validations/auth.ts, backend @IsCampusMartPassword)
export const passwordRequirements = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  {
    label: "Contains uppercase & lowercase",
    test: (v: string) => /[A-Z]/.test(v) && /[a-z]/.test(v),
  },
  {
    label: "Contains a number",
    test: (v: string) => /\d/.test(v),
  },
];

export const emailVerificationActions = [
  {
    id: "change_email",
    icon: ArrowRight,
    label: "Change Email Address",
    description: "Update your registered email",
  },
  {
    id: "resend",
    icon: RefreshCw,
    label: "Resend Verification Email",
    description: "Send a new verification link",
  },
];

export const twoFactorOptions = [
  {
    id: "sms" as const,
    icon: Smartphone,
    label: "SMS Verification",
    sub: "Receive codes via text message",
  },
  {
    id: "app" as const,
    icon: PlusSquare,
    label: "Authenticator App",
    sub: "Use Google Authenticator or similar",
  },
];

/* ─────────────────────────────────────────────
   Settings Data
───────────────────────────────────────────── */
export const cacheItems = [
  { icon: ImageIcon, label: "Image Cache", description: "Thumbnails and product images", mb: 12.3 },
  { icon: Clock, label: "Search History", description: "Recent search queries", mb: 4.8 },
  { icon: Globe, label: "Browsing Data", description: "Page data and cookies", mb: 5.1 },
  { icon: FileText, label: "Temporary Files", description: "Downloads and Temporary data", mb: 2.3 },
];

export const suggestedLanguages = [
  { code: "en-us", label: "English (US)", native: "English" },
  { code: "en-gb", label: "English (UK)", native: "English" },
];

export const allLanguagesList = [
  { code: "fr", label: "French", native: "Français" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "yo", label: "Yoruba", native: "Èdè Yorùbá" },
  { code: "ha", label: "Hausa", native: "Hausa" },
  { code: "ig", label: "Igbo", native: "Igbo" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "ja", label: "Japanese", native: "日本語" },
];
