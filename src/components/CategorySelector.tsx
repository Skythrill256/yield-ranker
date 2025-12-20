import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type Category = "covered-call-etfs" | "cef";

export const CategorySelector = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getCurrentCategory = (): Category => {
    if (location.pathname.startsWith("/cef")) {
      return "cef";
    }
    return "covered-call-etfs";
  };

  const currentCategory = getCurrentCategory();

  const categories = [
    { id: "covered-call-etfs" as Category, label: "Covered Call Option ETFs", path: "/" },
    { id: "cef" as Category, label: "Closed End Funds", path: "/cef" },
  ];

  const handleCategoryChange = (category: Category) => {
    const categoryConfig = categories.find(c => c.id === category);
    if (categoryConfig) {
      navigate(categoryConfig.path);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="px-4 py-2 text-sm font-medium text-foreground hover:bg-slate-100 hover:text-foreground transition-colors rounded-md flex items-center gap-1"
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Filter</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {categories.map((category) => (
          <DropdownMenuItem
            key={category.id}
            onClick={() => handleCategoryChange(category.id)}
            className={`cursor-pointer ${currentCategory === category.id ? "bg-primary/10 font-semibold" : ""}`}
          >
            {category.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

