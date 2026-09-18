// Resolve only choices that belong to the saved report, including older reports.
export function findReportOption(report,id){
 if(!report)return undefined;
 const options=report.schemaVersion===2?[report.packageSnapshot,report.alternative,...(report.serverOptions||[])]:report.options||[];
 return options.find(option=>option?.id===id);
}
