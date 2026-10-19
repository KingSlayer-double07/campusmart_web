// Marketing content only. Listings, categories and stores come from the API (guide Phase 3).

/**
 * Featured display data for the home page banner
 * Includes promotional banners and featured product highlights
 */
export const featuredDisplays = [
  {
    id: 1,
    title: "Campus Essentials",
    subtitle: "Everything you need for dorm life",
    image:
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    backgroundColor: "from-blue-500 to-blue-600",
    textColor: "text-white",
    ctaText: "Shop Now",
    ctaLink: "/categories",
    featured: true,
  },
  {
    id: 2,
    title: "Fashion Week",
    subtitle: "Trending styles for students",
    image:
      "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    backgroundColor: "from-purple-500 to-pink-500",
    textColor: "text-white",
    ctaText: "Explore",
    ctaLink: "/categories?category=FASHION",
    featured: true,
  },
  {
    id: 3,
    title: "Tech Deals",
    subtitle: "Save on electronics this week",
    image:
      "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    backgroundColor: "from-gray-900 to-gray-700",
    textColor: "text-white",
    ctaText: "View Deals",
    ctaLink: "/categories?category=TECH",
    featured: true,
  },
];

/**
 * Promotional data for display sections
 */
export const promotions = [
  {
    id: 1,
    title: "Welcome Back!",
    description: "Get 10% off your first order",
    code: "WELCOME10",
    expiresAt: "2026-02-15",
    image:
      "https://images.unsplash.com/photo-1556821552-7f41c5d440db?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    isActive: true,
  },
  {
    id: 2,
    title: "Student Verified",
    description: "Extra 5% off with student ID",
    code: "STUDENT5",
    expiresAt: "2026-03-31",
    image:
      "https://images.unsplash.com/photo-1577720643272-265f434b5c5f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    isActive: true,
  },
  {
    id: 3,
    title: "Bundle Deals",
    description: "Save more when you buy together",
    code: "BUNDLE20",
    expiresAt: "2026-02-28",
    image:
      "https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&auto=format&fit=crop&q=60&ixlib=rb-4.1.0",
    isActive: true,
  },
];
