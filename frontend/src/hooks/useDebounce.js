import { useEffect, useState } from 'react';
/**
 * useDebounce Hook
 *
 * Delays the execution of a value update until after the specified delay period
 * has elapsed since the last time the debounced function was invoked.
 *
 * @template T - The type of the value to be debounced
 * @param {T} value - The value to debounce
 * @param {number} delay - The delay in milliseconds (default: 300ms)
 * @returns {T} The debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * useEffect(() => {
 *   if (debouncedSearchTerm) {
 *     // Perform search operation
 *   }
 * }, [debouncedSearchTerm]);
 */
export function useDebounce(value, delay = 300) {
    // State to hold the debounced value
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        // Set up a timer to update the debounced value after the delay
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        // Clean up the timer on value change or unmount
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]); // Re-run effect when value or delay changes
    return debouncedValue;
}
