import { useState } from "react";
import { motion } from "framer-motion";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Footer } from "@/components/Footer";
import {
  Search,
  ExternalLink,
  FileText,
  Play,
  Wrench,
} from "lucide-react";
import { useCategory } from "@/utils/category";

interface Resource {
  id: string;
  title: string;
  description: string;
  url: string;
  type: "article" | "video" | "tool";
  source: string;
  featured?: boolean;
  category?: "cef" | "cc" | "both";
}

const Resources = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const currentCategory = useCategory();

  // Covered Call Option ETF Resources
  const ccResources: Resource[] = [
    {
      id: "1",
      title: "Doug The Retirement Guy",
      description:
        "Expert insights on retirement planning and covered call ETFs for income investors",
      url: "https://www.youtube.com/@retirement-guy",
      type: "video",
      source: "YouTube",
      featured: true,
    },
    {
      id: "2",
      title: "Marcos Villa",
      description:
        "In-depth analysis and strategies for covered call option ETFs and income generation",
      url: "https://www.youtube.com/@Marcos_Milla",
      type: "video",
      source: "YouTube",
      featured: true,
    },
    {
      id: "3",
      title: "Spencer Invests",
      description:
        "Practical investment strategies and portfolio management for covered call ETFs",
      url: "https://www.youtube.com/@SpencerInvests",
      type: "video",
      source: "YouTube",
      featured: true,
    },
    {
      id: "4",
      title: "Yield&Grace",
      description:
        "Educational content focused on dividend investing and yield-generating strategies",
      url: "https://www.youtube.com/@yieldandgrace",
      type: "video",
      source: "YouTube",
      featured: true,
    },
    {
      id: "5",
      title: "Ari Gutman",
      description:
        "Market analysis and covered call ETF strategies for consistent income generation",
      url: "https://www.youtube.com/@arigutman",
      type: "video",
      source: "YouTube",
      featured: true,
      category: "cc",
    },
  ];

  // Closed End Fund Resources
  const cefResources: Resource[] = [
    {
      id: "cef-1",
      title: "Dividends and Total Returns Instruction Video 1",
      description:
        "Instructional video on understanding dividends and total returns for closed-end fund investors",
      url: "#", // TODO: Add video URL when available
      type: "video",
      source: "Dividends and Total Returns",
      featured: true,
      category: "cef",
    },
    {
      id: "cef-2",
      title: "CEF Connect",
      description:
        "Comprehensive database and research platform for closed-end fund data, premiums, discounts, and distribution information",
      url: "https://www.cefconnect.com/",
      type: "tool",
      source: "CEF Connect",
      featured: true,
      category: "cef",
    },
    {
      id: "cef-3",
      title: "CEF Advisors",
      description:
        "Specialized CEF investment management, research, and data services with over 35 years of expertise in closed-end funds, BDCs, and interval funds",
      url: "https://cefdata.com/",
      type: "tool",
      source: "CEF Advisors",
      featured: true,
      category: "cef",
    },
    {
      id: "cef-4",
      title: "Seeking Alpha",
      description:
        "Financial research platform providing in-depth analysis, market insights, and investment strategies for closed-end funds and other securities",
      url: "https://seekingalpha.com/",
      type: "tool",
      source: "Seeking Alpha",
      featured: true,
      category: "cef",
    },
  ];

  // Filter resources based on selected category
  const allResources = currentCategory === "cef" ? cefResources : ccResources;
  
  // Add category to existing CC resources
  const resources: Resource[] = allResources.map((r, idx) => ({
    ...r,
    category: r.category || (currentCategory === "cc" ? "cc" : "cef"),
  }));

  const filteredResources = resources.filter((resource) => {
    const matchesSearch =
      resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      resource.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const featuredResources = filteredResources.filter((r) => r.featured);
  const regularResources = filteredResources.filter((r) => !r.featured);

  const getIcon = (type: string) => {
    switch (type) {
      case "article":
        return <FileText className="w-5 h-5" />;
      case "video":
        return <Play className="w-5 h-5" />;
      case "tool":
        return <Wrench className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container max-w-6xl mx-auto px-4 sm:px-6 py-12 md:py-16">
        <div className="space-y-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-6"
          >
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              <span className="text-foreground">Resources</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              {currentCategory === "cef" 
                ? "Resources for Closed End Fund investors. Here is our current list."
                : "Resources for Covered Call Option ETF investors. Here is our current list."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col sm:flex-row gap-4"
          >
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-base rounded-xl border-2"
              />
            </div>
          </motion.div>

          {featuredResources.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-6">Featured</h2>
              <div className="grid gap-6 md:grid-cols-2">
                {featuredResources.map((resource, idx) => (
                  <motion.div
                    key={resource.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + idx * 0.1 }}
                  >
                    <Card
                      className="p-8 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-primary/30 group bg-gradient-to-br from-primary/5 to-transparent"
                      onClick={() => window.open(resource.url, "_blank")}
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0 text-white">
                          {getIcon(resource.type)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-xl font-bold group-hover:text-primary transition-colors">
                              {resource.title}
                            </h3>
                            <ExternalLink className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground mb-4">
                            {resource.source}
                          </p>
                          <p className="text-muted-foreground leading-relaxed mb-4">
                            {resource.description}
                          </p>
                          <span className="inline-block text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full">
                            {resource.type.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {regularResources.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold mb-6">More Resources</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {regularResources.map((resource, idx) => (
                  <motion.div
                    key={resource.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: idx * 0.05 }}
                  >
                    <Card
                      className="p-6 hover:shadow-xl transition-all duration-300 cursor-pointer border-2 hover:border-primary/20 group h-full flex flex-col"
                      onClick={() => window.open(resource.url, "_blank")}
                    >
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary group-hover:bg-primary/20 transition-colors">
                          {getIcon(resource.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold mb-1 group-hover:text-primary transition-colors">
                            {resource.title}
                          </h3>
                          <p className="text-xs text-muted-foreground font-medium">
                            {resource.source}
                          </p>
                        </div>
                        <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4 flex-1">
                        {resource.description}
                      </p>
                      <span className="inline-block text-xs font-semibold text-muted-foreground bg-muted px-3 py-1.5 rounded-full self-start">
                        {resource.type.toUpperCase()}
                      </span>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {filteredResources.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No resources found matching your criteria.
              </p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Resources;
