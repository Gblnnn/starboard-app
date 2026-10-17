export default function Header() {
    return(
        <>
        <div style={{width:"100%", height:"4.5rem",display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0.25rem", userSelect:"none", position:"fixed", WebkitBackdropFilter:"blur(25px)", backdropFilter:"blur(25px)", zIndex:5, borderBottom:"2px solid rgba(100 100 100/ 25%)", boxShadow:"1px 1px 10px rgba(0 0 0/ 20%)"}}>

            <div style={{marginLeft:"1.25rem", display:"flex", alignItems:"center", gap:"0.5rem"}}>
                {/* <img style={{width:"2.5rem", height:"2.5rem", position:"absolute"}} src="/sohar_star_logo.png"/> */}
                <h1 style={{ opacity:0.8, textTransform:"capitalize", marginLeft:"0.5rem", fontSize:"1.75rem"}}>Dashboard</h1>
                {/* <p style={{position:"absolute", fontSize:"0.5rem", marginTop:"2.35rem", letterSpacing:"0.12rem", opacity:"0.5", marginLeft:"1.65rem"}}>SOHAR STAR UNITED LLC</p> */}
            </div>

        </div>
    
        </>
        

    )
}
