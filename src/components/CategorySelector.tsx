import { useNavigate } from "react-router-dom";
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

  // Filter always shows both options linking to documentation pages
  const options = [
    { label: "Covered Call Option ETFs", path: "/covered-call-etfs" },
    { label: "Closed End Funds", path: "/closed-end-funds" },
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
            className="cursor-pointer"
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

