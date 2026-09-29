import Back from "@/components/back";
import Directive from "@/components/directive";
import RefreshButton from "@/components/refresh-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ResponsiveModal } from "@/components/responsive-modal";
import {
    PhonebookRecord,
    getPhonebookData,
    getPhonebookFromCache,
    isCacheStale
} from "@/utils/phonebookCache";
import { motion } from "framer-motion";
import { AtSign, Building2, Notebook, PhoneIcon } from "lucide-react";
import { useEffect, useState } from "react";

const listAvatarFallbackStyle = {
    fontWeight: 500,
    background: "linear-gradient(145deg, rgba(236,241,255,0.95), rgba(226,236,255,0.92))",
    fontSize: "1.25rem",
    boxShadow: "0 2px 8px rgba(79, 70, 229, 0.18), inset 0 1px 0 rgba(255,255,255,0.9)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
} as const;

export default function Phonebook() {
    const [records, setRecords] = useState<PhonebookRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<PhonebookRecord | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    const filteredRecords = records.filter(record => {
        const displayName = record.display_name || record.name;
        const query = searchQuery.toLowerCase();
        const queryForNumbers = searchQuery.trim();

        // *123 syntax: match numbers ending with the digits after *
        if (queryForNumbers.startsWith("*")) {
            const suffix = queryForNumbers.slice(1);
            if (suffix.length === 0) return true;
            return (
                (record.phone && String(record.phone).endsWith(suffix)) ||
                (record.CUG && String(record.CUG).endsWith(suffix))
            );
        }

        return displayName.toLowerCase().includes(query) ||
            record.name.toLowerCase().includes(query) ||
            record.email.toLowerCase().includes(query) ||
            (record.phone && String(record.phone).startsWith(queryForNumbers)) ||
            (record.CUG && String(record.CUG).startsWith(queryForNumbers)) ||
            record.designation?.toLowerCase().includes(query);
    }).sort((a, b) => {
        const cugA = a.CUG || Number.MAX_SAFE_INTEGER;
        const cugB = b.CUG || Number.MAX_SAFE_INTEGER;
        return cugA - cugB;
    });

    const fetchData = async () => {
        try {
            setLoading(true);
            const fetchedRecords = await getPhonebookData(true); // Force refresh
            setRecords(fetchedRecords);
            setLoading(false);
        } catch (error) {
            console.error("Error fetching records:", error);
            setLoading(false);
        }
    }

    const getInitials = (name: string) => {
    return name[0]?.toUpperCase() || "?";
  };

    useEffect(() => {
        // Load from cache immediately for fast initial display
        const cachedData = getPhonebookFromCache();
        if (cachedData) {
            setRecords(cachedData);
        }

        // Fetch fresh data if cache is stale or doesn't exist
        const loadData = async () => {
            if (!cachedData || isCacheStale()) {
                try {
                    setLoading(true);
                    const freshData = await getPhonebookData();
                    setRecords(freshData);
                } catch (error) {
                    console.error("Error fetching records:", error);
                } finally {
                    setLoading(false);
                }
            }
        };

        loadData();
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 768);
        };

        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return(
        <>
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}>
        <div style={{padding: "", position:"fixed", zIndex: 20}}>
            <Back
            icon={<Notebook color="darkblue"/>}
            noback
            blurBG
            subtitle={records.length}
            fixed
        extra={
            <>
            <RefreshButton onClick={fetchData} fetchingData={loading}/>
            </>
        }
        //    icon={<Notebook color="mediumslateblue"/>} 
           title={"Phonebook"}/>
        </div>
        
        <div style={{
            position: "fixed",
            top: "4.5rem",
            left: 0,
            right: 0,
            padding: "0.75rem 1.25rem",
            background: "rgba(250, 250, 250)",
            zIndex: 15,
            borderBottom: "1px solid rgba(100, 100, 100, 0.1)"
        }}>
            <div style={{
                position: "relative",
                width: "100%",
            }}>
                <input
                    type="text"
                    placeholder="Search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: "100%",
                        padding: "0.75rem 1rem",
                        borderRadius: "0.9rem",
                        background: "rgba(246 248 252 / 0.78)",
                        // border: "1px solid rgba(210 218 234 / 0.7)",
                        boxShadow: "0 1px 4px rgba(79 70 229 / 0.06), inset 0 1px 0 rgba(255 255 255 / 0.85)",
                        fontSize: "1rem",
                        outline: "none",
                    }}
                />
            </div>
        </div>



        <div style={{ 
            border:"",
            paddingTop:"10rem",
            paddingLeft: "1.25rem",
            paddingRight: "1.25rem",
            paddingBottom: "8rem",
            display: isMobile ? "flex" : "grid",
            flexDirection: isMobile ? "column" : undefined,
            gridTemplateColumns: isMobile ? undefined : "repeat(4, 1fr)",
            gap: "0.75rem",
            zIndex: "",
        }}>

            {filteredRecords.map((record) => {
                const displayName = record.display_name || record.name;
                return (
                <Directive
                subtext={record.designation?.toLowerCase()}
                    onClick={() => {
                        setSelectedRecord(record);
                        setDrawerOpen(true);
                    }}
                                        icon={<Avatar className="">
                                            <AvatarFallback style={listAvatarFallbackStyle} className="text-lg">
                                                {displayName
                                                    ? getInitials(displayName.split("@")[0])
                                                    : "?"}
                                            </AvatarFallback>
                                        </Avatar>}
                    key={record.id}
                    title={displayName}
                    
                />
            );})}
        </div>
        </motion.div>

        <ResponsiveModal open={drawerOpen} onOpenChange={setDrawerOpen} title="" hideHeader>
                <div style={{ 
                    paddingTop:0,
                    padding: "1.25rem", 
                    width:"100%",
                    paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                }}>
                    <div style={{display:"flex", justifyContent:"center"}}>
                        <div style={{ position: "relative", width: "5rem", height: "5rem" }}>
                          <Avatar className="h-20 w-20" style={{ position: "absolute", inset: 0 }}>
                            <AvatarFallback style={{
                              fontWeight: "700",
                              background: "rgba(240 245 255 / 0.5)",
                            //   backdropFilter: "blur(10px)",
                            //   WebkitBackdropFilter: "blur(10px)",
                              fontSize: "2.5rem",
                           
                              boxShadow: "0 8px 40px rgba(79, 70, 229, 0.4), inset 0 2px 0 rgba(255,255,255,1), 0 0 24px rgba(79, 70, 229, 0.3)",
                              borderRadius: "50%",
                            //   border: "2.5px solid rgba(79, 70, 229, 0.75)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }} className="text-lg">
                              {selectedRecord
                                ? getInitials((selectedRecord.display_name || selectedRecord.name).split("@")[0])
                                : "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div style={{
                            position: "absolute",
                            inset: "0.1rem",
                            borderRadius: "50%",
                            pointerEvents: "none",
                            background: "linear-gradient(165deg, rgba(255,255,255,0.85) 0%, rgba(220,240,255,0.35) 50%, rgba(255,255,255,0) 100%)",
                          }} />
                        </div>
                    </div>
                    <br/>
                    <div style={{display:"flex", justifyContent:"center", alignItems:"center", padding:"1.25rem", paddingTop:"0", flexFlow:"column", gap:""}}>
                        <h2 style={{fontSize:"1.5rem", textTransform: "capitalize", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%"}}>{(selectedRecord?.display_name || selectedRecord?.name || "").toLowerCase()}</h2>
                        <p style={{fontSize:"0.8rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%", textTransform: "uppercase"}}>{selectedRecord?.designation?.toLowerCase()}</p>
                    </div>
                    
                    <div style={{ 
                        display: "flex", 
                        flexDirection: "column", 
                        gap: "0.75rem",
                        marginTop: "",
                        width: "100%"
                    }}>

                        <Directive onClick={() => { selectedRecord?.email && (location.href = "mailto:" + selectedRecord?.email); }} icon={<AtSign width={"1.25rem"} color="darkblue"/>} notName title={selectedRecord?.email||"No Email"} />
                        <div style={{display:"flex", gap:"0.75rem", width: "100%"}}>
                            <Directive notName onClick={() => { selectedRecord?.phone && (location.href = "tel:" + selectedRecord?.phone); }} title={selectedRecord?.phone||"No Contact"} icon={<PhoneIcon width={"1.25rem"} color="darkblue"/>}/>
                            {
                                selectedRecord?.CUG &&
                                <Directive notName onClick={() => { selectedRecord?.CUG && (location.href = "tel:" + selectedRecord?.CUG); }} title={selectedRecord?.CUG||"No CUG"} icon={<Building2 width={"1.25rem"} color="darkblue"/>}/>
                            }
                            
                        </div>
                        
                        
                    </div>
                </div>
        </ResponsiveModal>
        </>
    )
}
