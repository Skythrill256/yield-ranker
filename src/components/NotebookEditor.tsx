import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Plus,
    Trash2,
    GripVertical,
    Type,
    Heading1,
    Heading2,
    Heading3,
    Table,
    Calculator,
    MessageSquare,
    ChevronUp,
    ChevronDown,
    MoreVertical,
    Palette,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Types
export type BlockType = 'text' | 'heading1' | 'heading2' | 'heading3' | 'table' | 'formula' | 'comment';

export type NotebookBlock = {
    id: string;
    type: BlockType;
    content: string;
    metadata?: {
        createdAt: string;
        updatedAt: string;
        author?: string;
        color?: 'yellow' | 'blue' | 'green' | 'red' | 'purple';
        tableData?: {
            headers: string[];
            rows: string[][];
        };
    };
};

export type NotebookData = {
    blocks: NotebookBlock[];
    lastUpdated: string;
    version: number;
};

// Block type config
const BLOCK_TYPES = [
    { type: 'text' as BlockType, label: 'Text', icon: Type },
    { type: 'heading1' as BlockType, label: 'Heading 1', icon: Heading1 },
    { type: 'heading2' as BlockType, label: 'Heading 2', icon: Heading2 },
    { type: 'heading3' as BlockType, label: 'Heading 3', icon: Heading3 },
    { type: 'table' as BlockType, label: 'Table', icon: Table },
    { type: 'formula' as BlockType, label: 'Formula', icon: Calculator },
    { type: 'comment' as BlockType, label: 'Comment/Note', icon: MessageSquare },
];

const COMMENT_COLORS = [
    { value: 'yellow', label: 'Yellow', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800' },
    { value: 'blue', label: 'Blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800' },
    { value: 'green', label: 'Green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800' },
    { value: 'red', label: 'Red', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800' },
    { value: 'purple', label: 'Purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800' },
] as const;

// Generate unique ID
const generateId = () => Math.random().toString(36).substring(2, 9);

// Default empty table data
const createDefaultTableData = () => ({
    headers: ['Column 1', 'Column 2', 'Column 3'],
    rows: [['', '', ''], ['', '', '']],
});

interface NotebookEditorProps {
    initialData?: NotebookData;
    onSave: (data: NotebookData) => Promise<void>;
    saving?: boolean;
    loading?: boolean;
}

export const NotebookEditor: React.FC<NotebookEditorProps> = ({
    initialData,
    onSave,
    saving = false,
    loading = false,
}) => {
    const [blocks, setBlocks] = useState<NotebookBlock[]>(initialData?.blocks || []);
    const [hasChanges, setHasChanges] = useState(false);
    // Use ref to track latest blocks for immediate save access
    const blocksRef = useRef<NotebookBlock[]>(initialData?.blocks || []);

    // Update blocks when initialData changes
    useEffect(() => {
        if (initialData?.blocks) {
            setBlocks(initialData.blocks);
            blocksRef.current = initialData.blocks;
            setHasChanges(false);
        }
    }, [initialData]);

    // Keep ref in sync with blocks state - ensures immediate save access
    useEffect(() => {
        blocksRef.current = blocks;
    }, [blocks]);

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const addBlock = useCallback((type: BlockType, afterBlockId?: string) => {
        const newBlock: NotebookBlock = {
            id: generateId(),
            type,
            content: '',
            metadata: {
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                color: type === 'comment' ? 'yellow' : undefined,
                tableData: type === 'table' ? createDefaultTableData() : undefined,
            },
        };

        setBlocks(prev => {
            let newBlocks: NotebookBlock[];
            if (afterBlockId) {
                // If inserting after a specific block, find it and insert after
                const index = prev.findIndex(b => b.id === afterBlockId);
                if (index !== -1) {
                    newBlocks = [...prev];
                    newBlocks.splice(index + 1, 0, newBlock);
                } else {
                    // If block not found, add at top
                    newBlocks = [newBlock, ...prev];
                }
            } else {
                // Always add new blocks at the top
                newBlocks = [newBlock, ...prev];
            }
            // Update ref immediately for immediate save access
            blocksRef.current = newBlocks;
            return newBlocks;
        });
        setHasChanges(true);
    }, []);

    const updateBlock = useCallback((id: string, updates: Partial<NotebookBlock>) => {
        setBlocks(prev => {
            const newBlocks = prev.map(block =>
                block.id === id
                    ? {
                        ...block,
                        ...updates,
                        metadata: {
                            ...block.metadata,
                            ...updates.metadata,
                            updatedAt: new Date().toISOString()
                        }
                    }
                    : block
            );
            // Update ref immediately for immediate save access
            blocksRef.current = newBlocks;
            return newBlocks;
        });
        setHasChanges(true);
    }, []);

    const deleteBlock = useCallback((id: string) => {
        setBlocks(prev => {
            const newBlocks = prev.filter(block => block.id !== id);
            // Update ref immediately for immediate save access
            blocksRef.current = newBlocks;
            return newBlocks;
        });
        setHasChanges(true);
    }, []);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setBlocks((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over.id);
                const newBlocks = arrayMove(items, oldIndex, newIndex);
                blocksRef.current = newBlocks;
                return newBlocks;
            });
            setHasChanges(true);
        }
    }, []);

    const handleSave = useCallback(async () => {
        // Use ref to get latest blocks immediately, avoiding stale closure issues
        // This fixes the delay issue when saving right after adding new blocks
        const data: NotebookData = {
            blocks: blocksRef.current,
            lastUpdated: new Date().toISOString(),
            version: (initialData?.version || 0) + 1,
        };
        await onSave(data);
        setHasChanges(false);
    }, [initialData?.version, onSave]);

    // Keyboard shortcut for save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (!saving && !loading) {
                    handleSave();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave, saving, loading]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                <span className="ml-3 text-muted-foreground">Loading notebook...</span>
            </div>
        );
    }

    return (
        <div className="space-y-3 sm:space-y-4 w-full">
            {/* Toolbar - Responsive */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2 sm:p-3 bg-slate-50 rounded-lg border w-full">
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground whitespace-nowrap">Add block:</span>
                    <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                            <Button
                                key={type}
                                variant="outline"
                                size="sm"
                                onClick={() => addBlock(type)}
                                className="h-7 sm:h-8 text-xs sm:text-sm"
                            >
                                <Icon className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                <span className="hidden xs:inline sm:inline">{label}</span>
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 justify-end sm:justify-start">
                    {hasChanges && (
                        <span className="text-xs text-amber-600 font-medium whitespace-nowrap">Unsaved changes</span>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        size="sm"
                        className="text-xs sm:text-sm h-7 sm:h-8"
                    >
                        {saving ? 'Saving...' : 'Save Notebook'}
                    </Button>
                </div>
            </div>

            {/* Blocks with Drag and Drop */}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={blocks.map(block => block.id)}
                    strategy={verticalListSortingStrategy}
                >
                    <div className="space-y-2 sm:space-y-3 w-full">
                        <AnimatePresence mode="popLayout">
                            {blocks.map((block, index) => (
                                <SortableBlockItem
                                    key={block.id}
                                    block={block}
                                    index={index}
                                    total={blocks.length}
                                    onUpdate={(updates) => updateBlock(block.id, updates)}
                                    onDelete={() => deleteBlock(block.id)}
                                    onAddAfter={(type) => addBlock(type, block.id)}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </SortableContext>
            </DndContext>

            {/* Empty state */}
            {blocks.length === 0 && (
                <Card className="p-6 sm:p-8 text-center border-dashed border-2">
                    <div className="text-muted-foreground mb-4">
                        <MessageSquare className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
                        <p className="text-base sm:text-lg font-medium">Your notebook is empty</p>
                        <p className="text-xs sm:text-sm mt-1">Add blocks using the toolbar above to start documenting.</p>
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => addBlock('heading1')} className="text-xs sm:text-sm">
                            <Heading1 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> Add Heading
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addBlock('text')} className="text-xs sm:text-sm">
                            <Type className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> Add Text
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => addBlock('table')} className="text-xs sm:text-sm">
                            <Table className="w-3 h-3 sm:w-4 sm:h-4 mr-1" /> Add Table
                        </Button>
                    </div>
                </Card>
            )}
        </div>
    );
};

// Sortable Block Item Component
interface SortableBlockItemProps {
    block: NotebookBlock;
    index: number;
    total: number;
    onUpdate: (updates: Partial<NotebookBlock>) => void;
    onDelete: () => void;
    onAddAfter: (type: BlockType) => void;
}

const SortableBlockItem: React.FC<SortableBlockItemProps> = ({
    block,
    index,
    total,
    onUpdate,
    onDelete,
    onAddAfter,
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: block.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            layout
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
        >
            <BlockEditor
                block={block}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAddAfter={onAddAfter}
                isFirst={index === 0}
                isLast={index === total - 1}
                dragHandleProps={{ ...attributes, ...listeners }}
                isDragging={isDragging}
            />
        </motion.div>
    );
};

// Individual block editor
interface BlockEditorProps {
    block: NotebookBlock;
    onUpdate: (updates: Partial<NotebookBlock>) => void;
    onDelete: () => void;
    onAddAfter: (type: BlockType) => void;
    isFirst: boolean;
    isLast: boolean;
    dragHandleProps?: any;
    isDragging?: boolean;
}

const BlockEditor: React.FC<BlockEditorProps> = ({
    block,
    onUpdate,
    onDelete,
    onAddAfter,
    isFirst,
    isLast,
    dragHandleProps,
    isDragging = false,
}) => {
    const contentRef = useRef<HTMLDivElement>(null);
    const [isFocused, setIsFocused] = useState(false);
    const [showDaysFormulaToolbar, setShowDaysFormulaToolbar] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // Check if content starts with "DAYS FORMULA"
    useEffect(() => {
        const textContent = contentRef.current?.textContent?.trim().toUpperCase() || '';
        const shouldShow = isFocused && textContent.startsWith('DAYS FORMULA');
        setShowDaysFormulaToolbar(shouldShow);
    }, [block.content, isFocused]);

    // Position toolbar when visible
    useEffect(() => {
        if (showDaysFormulaToolbar && contentRef.current && toolbarRef.current) {
            const updateToolbarPosition = () => {
                const contentRect = contentRef.current?.getBoundingClientRect();
                const toolbar = toolbarRef.current;
                if (contentRect && toolbar) {
                    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                    
                    let top = contentRect.top + scrollTop - 45;
                    let left = contentRect.left + scrollLeft;
                    
                    // Ensure toolbar stays within viewport on mobile
                    const toolbarWidth = toolbar.offsetWidth || 200;
                    const viewportWidth = window.innerWidth;
                    
                    if (left + toolbarWidth > viewportWidth) {
                        left = viewportWidth - toolbarWidth - 10;
                    }
                    if (left < 10) {
                        left = 10;
                    }
                    
                    toolbar.style.top = `${top}px`;
                    toolbar.style.left = `${left}px`;
                }
            };
            
            updateToolbarPosition();
            window.addEventListener('scroll', updateToolbarPosition, true);
            window.addEventListener('resize', updateToolbarPosition);
            
            return () => {
                window.removeEventListener('scroll', updateToolbarPosition, true);
                window.removeEventListener('resize', updateToolbarPosition);
            };
        }
    }, [showDaysFormulaToolbar, block.content]);

    const getBlockStyles = () => {
        switch (block.type) {
            case 'heading1':
                return 'text-xl sm:text-2xl font-bold';
            case 'heading2':
                return 'text-lg sm:text-xl font-semibold';
            case 'heading3':
                return 'text-base sm:text-lg font-medium';
            case 'formula':
                return 'font-mono bg-slate-900 text-green-400 p-3 sm:p-4 rounded-lg text-sm sm:text-base';
            case 'comment': {
                const colorConfig = COMMENT_COLORS.find(c => c.value === (block.metadata?.color || 'yellow'));
                return `${colorConfig?.bg} ${colorConfig?.border} border-l-4 p-3 sm:p-4 rounded-r-lg`;
            }
            default:
                return '';
        }
    };

    const handleContentChange = (html: string) => {
        onUpdate({ content: html });
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        // Prevent Enter from creating a new paragraph if at start with "DAYS FORMULA"
        if (e.key === 'Enter' && showDaysFormulaToolbar) {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const textContent = contentRef.current?.textContent?.trim() || '';
                if (textContent.toUpperCase() === 'DAYS FORMULA') {
                    e.preventDefault();
                    // Move cursor after "DAYS FORMULA "
                    if (contentRef.current) {
                        const textNode = contentRef.current.firstChild;
                        if (textNode) {
                            const newRange = document.createRange();
                            newRange.setStart(textNode, textContent.length);
                            newRange.collapse(true);
                            selection.removeAllRanges();
                            selection.addRange(newRange);
                        }
                    }
                }
            }
        }
    };

    const renderContent = () => {
        if (block.type === 'table') {
            return (
                <TableBlock
                    data={block.metadata?.tableData || createDefaultTableData()}
                    onUpdate={(tableData) => onUpdate({ metadata: { ...block.metadata, tableData } })}
                />
            );
        }

        return (
            <div className="relative">
                {/* Contextual Toolbar for DAYS FORMULA */}
                {showDaysFormulaToolbar && (
                    <motion.div
                        ref={toolbarRef}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2"
                        style={{ pointerEvents: 'auto', maxWidth: 'calc(100vw - 20px)' }}
                    >
                        <span className="text-xs sm:text-sm text-muted-foreground px-1 sm:px-2 whitespace-nowrap">Text</span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 sm:h-8 text-xs sm:text-sm px-2 sm:px-3"
                            onClick={() => {
                                // Add text button functionality if needed
                                if (contentRef.current) {
                                    const selection = window.getSelection();
                                    if (selection && selection.rangeCount > 0) {
                                        const range = selection.getRangeAt(0);
                                        const textNode = document.createTextNode(' + ');
                                        range.insertNode(textNode);
                                        range.setStartAfter(textNode);
                                        range.collapse(true);
                                        selection.removeAllRanges();
                                        selection.addRange(range);
                                        handleContentChange(contentRef.current.innerHTML);
                                    }
                                }
                            }}
                        >
                            <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                            <span className="hidden xs:inline">Button</span>
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 sm:h-8 w-7 sm:w-8 p-0 text-destructive hover:text-destructive flex-shrink-0"
                            onClick={onDelete}
                            title="Delete block"
                        >
                            <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                        </Button>
                    </motion.div>
                )}

                <div
                    ref={contentRef}
                    contentEditable
                    suppressContentEditableWarning
                    className={`min-h-[32px] sm:min-h-[40px] focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 ${getBlockStyles()}`}
                    onBlur={(e) => {
                        setIsFocused(false);
                        handleContentChange(e.currentTarget.innerHTML);
                    }}
                    onFocus={() => setIsFocused(true)}
                    onInput={(e) => {
                        const html = e.currentTarget.innerHTML;
                        handleContentChange(html);
                    }}
                    onKeyDown={handleKeyDown}
                    dangerouslySetInnerHTML={{ __html: block.content || getPlaceholder(block.type) }}
                    data-placeholder={getPlaceholder(block.type)}
                />
            </div>
        );
    };

    return (
        <Card className={`group relative border hover:border-primary/30 transition-colors ${isDragging ? 'shadow-lg' : ''}`}>
            {/* Block controls - Responsive positioning */}
            <div className="absolute -left-2 sm:-left-1 top-1/2 -translate-y-1/2 -translate-x-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-10">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hidden sm:flex"
                    disabled={isFirst}
                >
                    <ChevronUp className="h-4 w-4" />
                </Button>
                <div
                    {...dragHandleProps}
                    className="h-6 w-6 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
                >
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hidden sm:flex"
                    disabled={isLast}
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>
            </div>

            <div className="p-2 sm:p-3 relative">
                {/* Block header - Responsive */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2 opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground uppercase tracking-wide">
                            {BLOCK_TYPES.find(t => t.type === block.type)?.label || block.type}
                        </span>
                        {block.type === 'comment' && (
                            <Select
                                value={block.metadata?.color || 'yellow'}
                                onValueChange={(color: typeof COMMENT_COLORS[number]['value']) =>
                                    onUpdate({ metadata: { ...block.metadata, color } })
                                }
                            >
                                <SelectTrigger className="h-6 w-20 sm:w-24 text-xs">
                                    <Palette className="w-3 h-3 mr-1" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {COMMENT_COLORS.map(color => (
                                        <SelectItem key={color.value} value={color.value}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-3 h-3 rounded ${color.bg} ${color.border} border`} />
                                                {color.label}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="flex items-center gap-1">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <div className="px-2 py-1 text-xs text-muted-foreground">Add block after</div>
                                {BLOCK_TYPES.map(({ type, label, icon: Icon }) => (
                                    <DropdownMenuItem key={type} onClick={() => onAddAfter(type)}>
                                        <Icon className="w-4 h-4 mr-2" />
                                        {label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={onDelete}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Block content */}
                {renderContent()}
            </div>
        </Card>
    );
};

// Table block component
interface TableBlockProps {
    data: { headers: string[]; rows: string[][] };
    onUpdate: (data: { headers: string[]; rows: string[][] }) => void;
}

const TableBlock: React.FC<TableBlockProps> = ({ data, onUpdate }) => {
    const updateHeader = (index: number, value: string) => {
        const newHeaders = [...data.headers];
        newHeaders[index] = value;
        onUpdate({ ...data, headers: newHeaders });
    };

    const updateCell = (rowIndex: number, colIndex: number, value: string) => {
        const newRows = data.rows.map((row, i) =>
            i === rowIndex
                ? row.map((cell, j) => j === colIndex ? value : cell)
                : row
        );
        onUpdate({ ...data, rows: newRows });
    };

    const addRow = () => {
        const newRow = new Array(data.headers.length).fill('');
        onUpdate({ ...data, rows: [...data.rows, newRow] });
    };

    const addColumn = () => {
        const newHeaders = [...data.headers, `Column ${data.headers.length + 1}`];
        const newRows = data.rows.map(row => [...row, '']);
        onUpdate({ headers: newHeaders, rows: newRows });
    };

    const deleteRow = (index: number) => {
        if (data.rows.length <= 1) return;
        const newRows = data.rows.filter((_, i) => i !== index);
        onUpdate({ ...data, rows: newRows });
    };

    const deleteColumn = (index: number) => {
        if (data.headers.length <= 1) return;
        const newHeaders = data.headers.filter((_, i) => i !== index);
        const newRows = data.rows.map(row => row.filter((_, i) => i !== index));
        onUpdate({ headers: newHeaders, rows: newRows });
    };

    return (
        <div className="space-y-2">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
                <table className="min-w-full text-xs sm:text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-100">
                            {data.headers.map((header, i) => (
                                <th key={i} className="border border-slate-300 px-2 sm:px-3 py-2 text-left relative group/header">
                                    <input
                                        type="text"
                                        value={header}
                                        onChange={(e) => updateHeader(i, e.target.value)}
                                        className="w-full bg-transparent font-semibold focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 text-xs sm:text-sm"
                                    />
                                    {data.headers.length > 1 && (
                                        <button
                                            onClick={() => deleteColumn(i)}
                                            className="absolute -top-2 right-0 opacity-0 group-hover/header:opacity-100 bg-destructive text-white rounded-full w-4 h-4 text-xs flex items-center justify-center"
                                        >
                                            ×
                                        </button>
                                    )}
                                </th>
                            ))}
                            <th className="border border-slate-300 w-8 sm:w-10">
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={addColumn}>
                                    <Plus className="h-3 w-3" />
                                </Button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.rows.map((row, rowIndex) => (
                            <tr key={rowIndex} className={rowIndex % 2 === 1 ? 'bg-slate-50' : ''}>
                                {row.map((cell, colIndex) => (
                                    <td key={colIndex} className="border border-slate-300 px-2 sm:px-3 py-2">
                                        <input
                                            type="text"
                                            value={cell}
                                            onChange={(e) => updateCell(rowIndex, colIndex, e.target.value)}
                                            className="w-full bg-transparent focus:outline-none focus:ring-1 focus:ring-primary rounded px-1 text-xs sm:text-sm"
                                            placeholder="..."
                                        />
                                    </td>
                                ))}
                                <td className="border border-slate-300 w-8 sm:w-10">
                                    {data.rows.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 w-6 p-0 text-destructive"
                                            onClick={() => deleteRow(rowIndex)}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <Button variant="outline" size="sm" onClick={addRow} className="text-xs sm:text-sm">
                <Plus className="h-3 w-3 mr-1" /> Add Row
            </Button>
        </div>
    );
};

// Placeholders
const getPlaceholder = (type: BlockType): string => {
    switch (type) {
        case 'heading1':
            return 'Heading 1...';
        case 'heading2':
            return 'Heading 2...';
        case 'heading3':
            return 'Heading 3...';
        case 'text':
            return 'Start typing...';
        case 'formula':
            return '// Enter formula or calculation...';
        case 'comment':
            return 'Add a note or comment...';
        default:
            return 'Start typing...';
    }
};

export default NotebookEditor;
