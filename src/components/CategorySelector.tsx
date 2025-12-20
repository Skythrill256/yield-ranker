import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "./ui/button";
import { ChevronDown, LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

export const CategorySelector = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine current category based on route
  const getCurrentCategory = (): "cef" | "cc" => {
    if (
      location.pathname === "/closed-end-funds" ||
      location.pathname.startsWith("/closed-end-funds") ||
      location.pathname.startsWith("/cef")
    ) {
      return "cef";
    }
    return "cc";
  };

  const currentCategory = getCurrentCategory();

  // Filter options - navigate to documentation pages
  const options = [
    { 
      label: "Covered Call Option ETFs", 
      path: "/covered-call-etfs",
      category: "cc" as const
    },
    { 
      label: "Closed End Funds", 
      path: "/closed-end-funds",
      category: "cef" as const
    },
  ];

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
        {options.map((option) => (
          <DropdownMenuItem
            key={option.path}
            onClick={() => navigate(option.path)}
            className={`cursor-pointer ${currentCategory === option.category ? 'bg-slate-100 font-semibold' : ''}`}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

