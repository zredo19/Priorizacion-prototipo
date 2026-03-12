import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import { Moon, Sun } from 'lucide-react';

function App() {
    const [isDarkMode, setIsDarkMode] = useState(false);

    useEffect(() => {
        // Check initial preference or OS setting
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark');
        }
    }, []);

    const toggleDarkMode = () => {
        if (isDarkMode) {
            document.documentElement.classList.remove('dark');
        } else {
            document.documentElement.classList.add('dark');
        }
        setIsDarkMode(!isDarkMode);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
            <nav className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-slate-800 sticky top-0 z-50 transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <div className="flex items-center cursor-pointer" onClick={() => window.dispatchEvent(new CustomEvent('nav-to-dashboard'))}>
                            <span className="text-2xl bg-gradient-to-r from-primary-600 to-blue-400 bg-clip-text text-transparent">
                                CAPEX Prioritizer
                            </span>
                        </div>
                        <div className="flex items-center">
                            <button
                                onClick={toggleDarkMode}
                                className="p-2 rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 transition-colors"
                                aria-label="Toggle dark mode"
                            >
                                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
                <Dashboard isDarkMode={isDarkMode} />
            </main>
        </div>
    );
}

export default App;
