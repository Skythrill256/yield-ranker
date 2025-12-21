/**
 * CEFDataMetadata - Data Source Documentation Component
 * 
 * Displays a collapsible table showing data sources and formulas
 * for all CEF table columns per user requirements.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";
import { Button } from "./ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "./ui/table";
import { Card } from "./ui/card";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "./ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface ColumnMetadata {
    fieldName: string;
    source: "RICH" | "API" | "CALC" | "FORMULA";
    formula?: string;
    records?: string;
    description?: string;
}

// CEF column metadata definitions
const CEF_COLUMN_METADATA: ColumnMetadata[] = [
    {
        fieldName: "Symbol",
        source: "RICH",
        description: "Ticker symbol from Excel upload",
        records: "-",
    },
    {
        fieldName: "Name",
        source: "RICH",
        description: "Fund name from Excel upload",
        records: "-",
    },
    {
        fieldName: "NAV",
        source: "API",
        description: "Net Asset Value from NAV symbol price data (Tiingo)",
        records: "15Y",
    },
    {
        fieldName: "Market Price",
        source: "API",
        description: "EOD close price (Tiingo)",
        records: "15Y",
    },
    {
        fieldName: "Premium/Discount",
        source: "CALC",
        formula: "(Market Price / NAV - 1) × 100",
        description: "How much the market price deviates from NAV",
        records: "-",
    },
    {
        fieldName: "5Y Z-Score",
        source: "CALC",
        formula: "(Current Discount - Mean) / StdDev",
        description: "5-year Z-Score with flexible lookback (504-1260 trading days)",
        records: "5Y max",
    },
    {
        fieldName: "6M NAV Trend",
        source: "CALC",
        formula: "((NAV today / NAV 126 days ago) - 1) × 100",
        description: "6-month NAV trend using 126 trading days",
        records: "-",
    },
    {
        fieldName: "12M NAV Return",
        source: "CALC",
        formula: "((NAV today / NAV 252 days ago) - 1) × 100",
        description: "12-month NAV return using 252 trading days",
        records: "-",
    },
    {
        fieldName: "Signal",
        source: "CALC",
        formula: "See formula below*",
        description: "Signal rating from -2 (Overvalued) to +3 (Optimal)",
        records: "-",
    },
    {
        fieldName: "DVI",
        source: "CALC",
        formula: "(SD / Avg of annualized adj dividends) × 100",
        description: "Dividend Volatility Index - lower is more stable",
        records: "12M",
    },
    {
        fieldName: "3Y/5Y/10Y/15Y Returns",
        source: "CALC",
        formula: "Annualized CAGR from NAV adjClose",
        description: "Total returns using NAV adjusted close prices",
        records: "Up to 15Y",
    },
    {
        fieldName: "Dividend History",
        source: "API",
        description: "Dividend records from Tiingo",
        records: "15Y",
    },
];

// Signal scoring logic explanation
const SIGNAL_FORMULA = `
Signal Score Logic:
+3 (Optimal): Z < -1.5 AND 6M > 0 AND 12M > 0
+2 (Good Value): Z < -1.5 AND 6M > 0
+1 (Healthy): Z > -1.5 AND 6M > 0
 0 (Neutral): Default
-1 (Value Trap): Z < -1.5 AND 6M < 0
-2 (Overvalued): Z > 1.5
`;

// Source badge colors
const SOURCE_COLORS: Record<string, string> = {
    RICH: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    API: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    CALC: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    FORMULA: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export const CEFDataMetadata = () => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <Card className="mt-8 border-2 border-muted">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger asChild>
                    <Button
                        variant="ghost"
                        className="w-full flex items-center justify-between p-4 h-auto"
                    >
                        <div className="flex items-center gap-2">
                            <Info className="w-5 h-5 text-primary" />
                            <span className="font-semibold text-lg">Data Sources & Formulas</span>
                        </div>
                        {isOpen ? (
                            <ChevronUp className="w-5 h-5" />
                        ) : (
                            <ChevronDown className="w-5 h-5" />
                        )}
                    </Button>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="px-4 pb-4">
                        {/* Legend */}
                        <div className="flex flex-wrap gap-4 mb-4 text-sm">
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS.RICH}`}>
                                    RICH
                                </span>
                                <span className="text-muted-foreground">Excel Upload</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS.API}`}>
                                    API
                                </span>
                                <span className="text-muted-foreground">Tiingo EOD Data</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS.CALC}`}>
                                    CALC
                                </span>
                                <span className="text-muted-foreground">Server-side Calculation</span>
                            </div>
                        </div>

                        {/* Metadata Table */}
                        <div className="border rounded-lg overflow-hidden">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/50">
                                        <TableHead className="font-bold">Field Name</TableHead>
                                        <TableHead className="font-bold">Source</TableHead>
                                        <TableHead className="font-bold">Calculation / Formula</TableHead>
                                        <TableHead className="font-bold text-right"># Records</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {CEF_COLUMN_METADATA.map((col) => (
                                        <TableRow key={col.fieldName}>
                                            <TableCell className="font-medium">
                                                <Tooltip>
                                                    <TooltipTrigger className="text-left">
                                                        {col.fieldName}
                                                    </TooltipTrigger>
                                                    {col.description && (
                                                        <TooltipContent side="right" className="max-w-xs">
                                                            {col.description}
                                                        </TooltipContent>
                                                    )}
                                                </Tooltip>
                                            </TableCell>
                                            <TableCell>
                                                <span
                                                    className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[col.source]
                                                        }`}
                                                >
                                                    {col.source}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground font-mono">
                                                {col.formula || "-"}
                                            </TableCell>
                                            <TableCell className="text-right text-sm">
                                                {col.records || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {/* Signal Formula Reference */}
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm font-semibold mb-2">* Signal Score Formula:</p>
                            <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                                {SIGNAL_FORMULA.trim()}
                            </pre>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
};

export default CEFDataMetadata;
