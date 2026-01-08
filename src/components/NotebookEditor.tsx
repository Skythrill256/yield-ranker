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
    Bold,
    Italic,
    Underline,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    List,
    ListOrdered,
    Minus,
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
    const [showFormatToolbar, setShowFormatToolbar] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const toolbarRef = useRef<HTMLDivElement>(null);
    const [formatState, setFormatState] = useState({
        bold: false,
        italic: false,
        underline: false,
        fontSize: '16px',
        alignment: 'left',
    });

    // Ensure component is mounted before accessing browser APIs
    useEffect(() => {
        setIsMounted(true);
    }, []);

    // Show toolbar only when actively editing text blocks (not tables or formulas)
    useEffect(() => {
        const shouldShow = isMounted && isFocused && block.type !== 'table' && block.type !== 'formula';
        setShowFormatToolbar(shouldShow);
        
        // Also check if content element has focus (handles clicks anywhere in block)
        if (contentRef.current && block.type !== 'table' && block.type !== 'formula') {
            const checkFocus = () => {
                if (document.activeElement === contentRef.current || contentRef.current?.contains(document.activeElement)) {
                    setIsFocused(true);
                }
            };
            
            // Check on click anywhere in the content area (including after images)
            contentRef.current.addEventListener('click', checkFocus, true);
            contentRef.current.addEventListener('focus', checkFocus, true);
            
            return () => {
                contentRef.current?.removeEventListener('click', checkFocus, true);
                contentRef.current?.removeEventListener('focus', checkFocus, true);
            };
        }
    }, [isMounted, isFocused, block.type]);

    // Update format state based on current selection - simplified
    useEffect(() => {
        if (!isMounted || !isFocused || !contentRef.current || typeof document === 'undefined') {
            return;
        }
        
        const updateFormatState = () => {
            try {
                if (!contentRef.current || typeof document.queryCommandState !== 'function') {
                    return;
                }
                
                const selection = window.getSelection?.();
                if (!selection || selection.rangeCount === 0) {
                    return;
                }
                
                const range = selection.getRangeAt(0);
                if (!range || !contentRef.current.contains(range.commonAncestorContainer)) {
                    return;
                }
                
                try {
                    const bold = document.queryCommandState('bold') || false;
                    const italic = document.queryCommandState('italic') || false;
                    const underline = document.queryCommandState('underline') || false;
                    const alignment = contentRef.current?.style?.textAlign || 'left';
                    
                    setFormatState(prev => ({
                        ...prev,
                        bold,
                        italic,
                        underline,
                        alignment: alignment || 'left',
                    }));
                } catch (cmdError) {
                    // If queryCommandState fails, just keep previous state
                }
            } catch (error) {
                // Silently handle errors
            }
        };
        
        const handleSelectionChange = () => {
            if (isFocused && contentRef.current) {
                setTimeout(updateFormatState, 50);
            }
        };
        
        if (typeof document !== 'undefined') {
            document.addEventListener('selectionchange', handleSelectionChange);
            setTimeout(updateFormatState, 10);
        }
        
        return () => {
            if (typeof document !== 'undefined') {
                document.removeEventListener('selectionchange', handleSelectionChange);
            }
        };
    }, [isMounted, isFocused]);

    // Position toolbar at top of block - fixed position
    useEffect(() => {
        if (!isMounted || !showFormatToolbar || !contentRef.current || !toolbarRef.current) {
            return;
        }
        
        const updateToolbarPosition = () => {
            try {
                if (!contentRef.current || !toolbarRef.current) {
                    return;
                }
                
                const contentRect = contentRef.current.getBoundingClientRect();
                const toolbar = toolbarRef.current;
                
                if (!contentRect || !toolbar) {
                    return;
                }
                
                // Position toolbar near cursor/selection position
                let top = 0;
                let left = contentRect.left;
                
                // Try to get selection position first
                try {
                    const selection = window.getSelection();
                    if (selection && selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        if (range) {
                            const rect = range.getBoundingClientRect();
                            if (rect && rect.height > 0) {
                                // Position above or below selection based on available space
                                const selectionTop = rect.top;
                                const selectionBottom = rect.bottom;
                                const spaceAbove = selectionTop;
                                const spaceBelow = window.innerHeight - selectionBottom;
                                
                                if (spaceAbove > 60 || spaceAbove > spaceBelow) {
                                    // Position above selection
                                    top = selectionTop - 50;
                                } else {
                                    // Position below selection
                                    top = selectionBottom + 5;
                                }
                                left = rect.left;
                            } else {
                                // Cursor position (collapsed range)
                                const rangeRect = range.getBoundingClientRect();
                                top = rangeRect.top - 50;
                                left = rangeRect.left;
                            }
                        }
                    }
                } catch (e) {
                    // Fallback to content top if selection fails
                    top = contentRect.top - 50;
                }
                
                // Fallback to content position if no selection
                if (top === 0 || top < 0) {
                    top = contentRect.top - 50;
                }
                
                // Ensure toolbar stays within viewport
                const toolbarWidth = toolbar.offsetWidth || 300;
                const viewportWidth = window.innerWidth || 800;
                const viewportHeight = window.innerHeight || 600;
                
                // Adjust horizontal position
                if (left + toolbarWidth > viewportWidth - 10) {
                    left = Math.max(10, viewportWidth - toolbarWidth - 10);
                }
                if (left < 10) {
                    left = 10;
                }
                
                // Adjust vertical position
                if (top < 10) {
                    top = Math.min(contentRect.bottom + 5, viewportHeight - 60);
                }
                if (top + 60 > viewportHeight) {
                    top = Math.max(10, contentRect.top - 50);
                }
                
                toolbar.style.top = `${top}px`;
                toolbar.style.left = `${left}px`;
            } catch (error) {
                // Silently handle positioning errors
            }
        };
        
        updateToolbarPosition();
        const interval = setInterval(updateToolbarPosition, 300);
        
        const handleScroll = () => updateToolbarPosition();
        const handleResize = () => updateToolbarPosition();
        
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [isMounted, showFormatToolbar]);

    // Format command helpers - only applies to selection
    const execCommand = (command: string, value?: string) => {
        try {
            if (typeof document !== 'undefined' && typeof document.execCommand === 'function' && contentRef.current) {
                const selection = window.getSelection();
                if (selection && selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    const hasSelection = !range.collapsed && selection.toString().length > 0;
                    
                    // Always ensure LTR direction
                    contentRef.current.style.direction = 'ltr';
                    
                    if (hasSelection) {
                        // Apply formatting to selected text only
                        document.execCommand(command, false, value);
                        
                        // Ensure all formatted elements have LTR direction
                        const formattedElements = range.commonAncestorContainer.parentElement?.querySelectorAll('*') || [];
                        formattedElements.forEach((el: Element) => {
                            if (el instanceof HTMLElement) {
                                el.style.direction = 'ltr';
                            }
                        });
                        
                        // Restore selection after command
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        // No selection - apply formatting at cursor position (for future typing)
                        document.execCommand(command, false, value);
                        
                        // Ensure any newly created elements are LTR
                        const selectionAfter = window.getSelection();
                        if (selectionAfter && selectionAfter.rangeCount > 0) {
                            const rangeAfter = selectionAfter.getRangeAt(0);
                            const element = rangeAfter.commonAncestorContainer.nodeType === Node.TEXT_NODE
                                ? rangeAfter.commonAncestorContainer.parentElement
                                : rangeAfter.commonAncestorContainer as HTMLElement;
                            if (element && element !== contentRef.current) {
                                element.style.direction = 'ltr';
                            }
                        }
                    }
                    
                    contentRef.current.focus();
                    if (contentRef.current) {
                        handleContentChange(contentRef.current.innerHTML);
                    }
                } else {
                    // No selection, execute normally but ensure LTR
                    document.execCommand(command, false, value);
                    if (contentRef.current) {
                        contentRef.current.style.direction = 'ltr';
                        contentRef.current.focus();
                        handleContentChange(contentRef.current.innerHTML);
                    }
                }
            }
        } catch (error) {
            // Silently handle errors
        }
    };

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

    const renderContent = () => {
        try {
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
                    {/* Rich Text Formatting Toolbar - Word-style */}
                    {isMounted && showFormatToolbar && (
                    <motion.div
                        ref={toolbarRef}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-xl p-1 sm:p-1.5 flex items-center gap-0.5 sm:gap-1 flex-wrap justify-center sm:justify-start"
                        style={{ pointerEvents: 'auto', maxWidth: 'calc(100vw - 20px)', minWidth: '280px' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            // Keep content focused when clicking toolbar
                            if (contentRef.current) {
                                contentRef.current.focus();
                                setIsFocused(true);
                            }
                        }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onFocus={(e) => {
                            e.stopPropagation();
                            // Keep toolbar visible when dropdown opens
                            setIsFocused(true);
                        }}
                    >
                        {/* Text Formatting */}
                        <div className="flex items-center gap-0.5 border-r border-slate-300 dark:border-slate-600 pr-0.5 sm:pr-1 mr-0.5 sm:mr-1">
                            <Button
                                variant={formatState.bold ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => execCommand('bold')}
                                title="Bold"
                            >
                                <Bold className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant={formatState.italic ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => execCommand('italic')}
                                title="Italic"
                            >
                                <Italic className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant={formatState.underline ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => execCommand('underline')}
                                title="Underline"
                            >
                                <Underline className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                        </div>

                        {/* Font Size */}
                        <div className="flex items-center gap-0.5 border-r border-slate-300 dark:border-slate-600 pr-0.5 sm:pr-1 mr-0.5 sm:mr-1">
                            <Select
                                value={formatState.fontSize || '16px'}
                                onValueChange={(value) => {
                                    try {
                                        if (contentRef.current) {
                                            const selection = window.getSelection();
                                            if (selection && selection.rangeCount > 0) {
                                                const range = selection.getRangeAt(0);
                                                
                                                // If text is selected, apply to selection only
                                                if (!range.collapsed && selection.toString().length > 0) {
                                                    // Wrap selected text in span with font size
                                                    const span = document.createElement('span');
                                                    span.style.fontSize = value;
                                                    span.style.direction = 'ltr';
                                                    
                                                    try {
                                                        range.surroundContents(span);
                                                    } catch (e) {
                                                        // If surroundContents fails, extract and wrap
                                                        const contents = range.extractContents();
                                                        span.appendChild(contents);
                                                        range.insertNode(span);
                                                    }
                                                    
                                                    // Update selection
                                                    const newRange = document.createRange();
                                                    newRange.selectNodeContents(span);
                                                    selection.removeAllRanges();
                                                    selection.addRange(newRange);
                                                } else {
                                                    // No selection - apply to current position or parent
                                                    const element = range.commonAncestorContainer.nodeType === Node.TEXT_NODE
                                                        ? range.commonAncestorContainer.parentElement
                                                        : (range.commonAncestorContainer as HTMLElement);
                                                    
                                                    if (element && element !== contentRef.current) {
                                                        element.style.fontSize = value;
                                                        element.style.direction = 'ltr';
                                                    } else {
                                                        // Create span at cursor
                                                        const span = document.createElement('span');
                                                        span.style.fontSize = value;
                                                        span.style.direction = 'ltr';
                                                        range.insertNode(span);
                                                        range.setStartAfter(span);
                                                        range.collapse(true);
                                                        selection.removeAllRanges();
                                                        selection.addRange(range);
                                                    }
                                                }
                                                
                                                setFormatState(prev => ({ ...prev, fontSize: value }));
                                                handleContentChange(contentRef.current.innerHTML);
                                                contentRef.current.focus();
                                            }
                                        }
                                    } catch (error) {
                                        // Silently handle errors
                                    }
                                }}
                                onOpenChange={(open) => {
                                    // Keep toolbar visible when dropdown opens
                                    if (open) {
                                        setIsFocused(true);
                                    }
                                }}
                            >
                                <SelectTrigger className="h-7 w-14 sm:h-8 sm:w-18 text-xs border-0 shadow-none px-1 sm:px-2">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent
                                    onCloseAutoFocus={(e) => {
                                        e.preventDefault();
                                        // Keep content focused when dropdown closes
                                        if (contentRef.current) {
                                            setTimeout(() => {
                                                contentRef.current?.focus();
                                                setIsFocused(true);
                                            }, 100);
                                        }
                                    }}
                                    onEscapeKeyDown={(e) => {
                                        // Keep focused when closing with escape
                                        if (contentRef.current) {
                                            contentRef.current.focus();
                                        }
                                    }}
                                >
                                    <SelectItem value="10px">10px</SelectItem>
                                    <SelectItem value="12px">12px</SelectItem>
                                    <SelectItem value="14px">14px</SelectItem>
                                    <SelectItem value="16px">16px</SelectItem>
                                    <SelectItem value="18px">18px</SelectItem>
                                    <SelectItem value="20px">20px</SelectItem>
                                    <SelectItem value="24px">24px</SelectItem>
                                    <SelectItem value="28px">28px</SelectItem>
                                    <SelectItem value="32px">32px</SelectItem>
                                    <SelectItem value="36px">36px</SelectItem>
                                    <SelectItem value="48px">48px</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Text Alignment */}
                        <div className="flex items-center gap-0.5 border-r border-slate-300 dark:border-slate-600 pr-0.5 sm:pr-1 mr-0.5 sm:mr-1">
                            <Button
                                variant={formatState.alignment === 'left' ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => {
                                    const selection = window.getSelection();
                                    if (selection && selection.rangeCount > 0 && !selection.toString().length) {
                                        // No selection - apply to entire block
                                        if (contentRef.current) {
                                            contentRef.current.style.textAlign = 'left';
                                            contentRef.current.style.direction = 'ltr';
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    } else {
                                        // Selection exists - apply to selection only via execCommand
                                        execCommand('justifyLeft');
                                        if (contentRef.current) {
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    }
                                }}
                                title="Align Left"
                            >
                                <AlignLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant={formatState.alignment === 'center' ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => {
                                    const selection = window.getSelection();
                                    if (selection && selection.rangeCount > 0 && !selection.toString().length) {
                                        // No selection - apply to entire block
                                        if (contentRef.current) {
                                            contentRef.current.style.textAlign = 'center';
                                            contentRef.current.style.direction = 'ltr';
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    } else {
                                        // Selection exists - apply to selection only
                                        execCommand('justifyCenter');
                                        if (contentRef.current) {
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    }
                                }}
                                title="Align Center"
                            >
                                <AlignCenter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant={formatState.alignment === 'right' ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => {
                                    const selection = window.getSelection();
                                    if (selection && selection.rangeCount > 0 && !selection.toString().length) {
                                        // No selection - apply to entire block
                                        if (contentRef.current) {
                                            contentRef.current.style.textAlign = 'right';
                                            contentRef.current.style.direction = 'ltr';
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    } else {
                                        // Selection exists - apply to selection only
                                        execCommand('justifyRight');
                                        if (contentRef.current) {
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    }
                                }}
                                title="Align Right"
                            >
                                <AlignRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant={formatState.alignment === 'justify' ? "secondary" : "ghost"}
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0 hidden sm:flex"
                                onClick={() => {
                                    const selection = window.getSelection();
                                    if (selection && selection.rangeCount > 0 && !selection.toString().length) {
                                        // No selection - apply to entire block
                                        if (contentRef.current) {
                                            contentRef.current.style.textAlign = 'justify';
                                            contentRef.current.style.direction = 'ltr';
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    } else {
                                        // Selection exists - apply to selection only
                                        execCommand('justifyFull');
                                        if (contentRef.current) {
                                            handleContentChange(contentRef.current.innerHTML);
                                        }
                                    }
                                }}
                                title="Justify"
                            >
                                <AlignJustify className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                        </div>

                        {/* Lists */}
                        <div className="flex items-center gap-0.5 border-r border-slate-300 dark:border-slate-600 pr-0.5 sm:pr-1 mr-0.5 sm:mr-1">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => execCommand('insertUnorderedList')}
                                title="Bullet List"
                            >
                                <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                                onClick={() => execCommand('insertOrderedList')}
                                title="Numbered List"
                            >
                                <ListOrdered className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                        </div>

                        {/* Delete Block */}
                        <div className="flex items-center gap-0.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={onDelete}
                                title="Delete block"
                            >
                                <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                <div
                    ref={contentRef}
                    contentEditable
                    suppressContentEditableWarning
                    className={`min-h-[32px] sm:min-h-[40px] focus:outline-none focus:ring-2 focus:ring-primary/20 rounded px-2 py-1 ${getBlockStyles()}`}
                    onBlur={(e) => {
                        // Delay to allow toolbar clicks and dropdown interactions
                        setTimeout(() => {
                            try {
                                const activeElement = document.activeElement;
                                // Keep focused if clicking on toolbar or any dropdown
                                if (toolbarRef.current?.contains(activeElement) ||
                                    activeElement?.closest('[role="listbox"]') ||
                                    activeElement?.closest('[role="menu"]') ||
                                    activeElement?.closest('[data-radix-popper-content-wrapper]')) {
                                    // Don't blur, keep focus
                                    return;
                                }
                                setIsFocused(false);
                                handleContentChange(e.currentTarget.innerHTML);
                            } catch (error) {
                                setIsFocused(false);
                                handleContentChange(e.currentTarget.innerHTML);
                            }
                        }, 300);
                    }}
                    onFocus={(e) => {
                        setIsFocused(true);
                        // Ensure LTR direction when focusing
                        e.currentTarget.style.direction = 'ltr';
                        // Remove any RTL styling that might be inherited
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            if (range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE) {
                                const element = range.commonAncestorContainer as HTMLElement;
                                if (element) {
                                    element.style.direction = 'ltr';
                                }
                            }
                        }
                    }}
                    onInput={(e) => {
                        const html = e.currentTarget.innerHTML;
                        // Ensure direction is always LTR after input
                        e.currentTarget.style.direction = 'ltr';
                        handleContentChange(html);
                    }}
                    onKeyDown={(e) => {
                        // Ensure LTR direction on every keystroke
                        if (contentRef.current) {
                            contentRef.current.style.direction = 'ltr';
                        }
                        // Remove RTL from any newly created elements
                        const selection = window.getSelection();
                        if (selection && selection.rangeCount > 0) {
                            const range = selection.getRangeAt(0);
                            if (range.commonAncestorContainer) {
                                let element: HTMLElement | null = null;
                                if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
                                    element = range.commonAncestorContainer.parentElement;
                                } else {
                                    element = range.commonAncestorContainer as HTMLElement;
                                }
                                if (element && element !== contentRef.current) {
                                    element.style.direction = 'ltr';
                                }
                            }
                        }
                    }}
                    dangerouslySetInnerHTML={{ __html: block.content || getPlaceholder(block.type) }}
                    data-placeholder={getPlaceholder(block.type)}
                    style={{ 
                        textAlign: formatState.alignment as any,
                        direction: 'ltr', // Always left-to-right
                    }}
                />
            </div>
        );
        } catch (error) {
            console.error('Error rendering block content:', error);
            return (
                <div className="p-4 text-sm text-muted-foreground border border-destructive rounded">
                    Error rendering block. Please try again.
                </div>
            );
        }
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
                            <DropdownMenuContent 
                                align="end"
                                onCloseAutoFocus={(e) => {
                                    e.preventDefault();
                                    // Keep content focused when dropdown closes
                                    if (contentRef.current) {
                                        setTimeout(() => {
                                            contentRef.current?.focus();
                                            setIsFocused(true);
                                        }, 100);
                                    }
                                }}
                            >
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
