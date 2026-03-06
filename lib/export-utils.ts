/**
 * Utility to export JSON data to a CSV file and trigger a download.
 * @param data - Array of objects to export
 * @param filename - Name of the file (without .csv)
 * @param headers - Mapping of object keys to CSV headers (e.g. { nozzle_number: 'Nozzle', amount: 'Amount' })
 */
export function exportToCSV(data: any[], filename: string, headers: Record<string, string>) {
    if (!data || data.length === 0) {
        return;
    }

    const columnKeys = Object.keys(headers);
    const csvRows = [];

    // 1. Add Header row
    csvRows.push(columnKeys.map(key => `"${headers[key]}"`).join(','));

    // 2. Add Data rows
    for (const row of data) {
        const values = columnKeys.map(key => {
            let val = row[key];

            // Handle nested properties (e.g. 'nozzles.nozzle_number')
            if (key.includes('.')) {
                const parts = key.split('.');
                let current: any = row;
                for (const part of parts) {
                    current = current ? current[part] : null;
                }
                val = current;
            }

            const escaped = ('' + (val || '')).replace(/"/g, '""');
            return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
    }

    // 3. Create Blob and Trigger Download
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
