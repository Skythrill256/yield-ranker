import React, { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ERROR_DIALOG_EVENT } from '@/utils/errorHandler';

interface ErrorDialogData {
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    onResume?: () => void;
    showResume?: boolean;
}

export function GlobalErrorDialog() {
    const [open, setOpen] = useState(false);
    const [dialogData, setDialogData] = useState<ErrorDialogData | null>(null);

    useEffect(() => {
        const handleErrorDialog = (event: Event) => {
            const customEvent = event as CustomEvent<ErrorDialogData>;
            setDialogData(customEvent.detail);
            setOpen(true);
        };

        window.addEventListener(ERROR_DIALOG_EVENT, handleErrorDialog);

        return () => {
            window.removeEventListener(ERROR_DIALOG_EVENT, handleErrorDialog);
        };
    }, []);

    const handleConfirm = () => {
        if (dialogData?.onConfirm) {
            dialogData.onConfirm();
        }
        setOpen(false);
        setDialogData(null);
    };

    const handleCancel = () => {
        if (dialogData?.onCancel) {
            dialogData.onCancel();
        }
        setOpen(false);
        setDialogData(null);
    };

    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{dialogData?.title || 'Error'}</AlertDialogTitle>
                    <AlertDialogDescription className="whitespace-pre-line">
                        {dialogData?.message || ''}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                    {dialogData?.showResume && dialogData?.onResume && (
                        <Button
                            variant="outline"
                            onClick={() => {
                                if (dialogData.onResume) {
                                    dialogData.onResume();
                                }
                                setOpen(false);
                                setDialogData(null);
                            }}
                            className="w-full sm:w-auto"
                        >
                            Resume Where I Was
                        </Button>
                    )}
                    {dialogData?.onCancel && (
                        <AlertDialogCancel onClick={handleCancel} className="w-full sm:w-auto">
                            Continue Anyway
                        </AlertDialogCancel>
                    )}
                    <AlertDialogAction 
                        onClick={handleConfirm}
                        className="w-full sm:w-auto"
                    >
                        {dialogData?.onConfirm ? 'Reload Page' : 'OK'}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

