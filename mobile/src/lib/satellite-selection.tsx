import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Selection = {
  year: number;
  month: number;
  setSelection: (year: number, month: number) => void;
};

const SelectionContext = createContext<Selection | null>(null);

export function SatelliteSelectionProvider({ children }: { children: ReactNode }) {
  const [year, setYear] = useState(2023);
  const [month, setMonth] = useState(8);
  const setSelection = useCallback((nextYear: number, nextMonth: number) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);
  const value = useMemo(
    () => ({ year, month, setSelection }),
    [month, setSelection, year],
  );
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSatelliteSelection() {
  const selection = useContext(SelectionContext);
  if (!selection) throw new Error('SatelliteSelectionProvider es requerido.');
  return selection;
}
