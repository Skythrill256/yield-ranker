import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronDown } from "lucide-react";
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
    { id: "covered-call-etfs" as Category, label: "CC ETFs", path: "/" },
    { id: "cef" as Category, label: "CEFs", path: "/cef" },
  ];

  const currentCategoryLabel = categories.find(c => c.id === currentCategory)?.label || "CC ETFs";

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
          variant="outline"
          className="flex items-center gap-2 border-2 border-slate-300 hover:border-primary hover:bg-primary/5 transition-colors"
        >
          <span className="font-medium">{currentCategoryLabel}</span>
          <ChevronDown className="h-4 w-4" />
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

