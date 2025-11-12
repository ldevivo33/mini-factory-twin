# mini-factory-twin
An AI-driven factory twin modelling a manufacturing assembly line that learns to optimize throughput and maintenance scheduling in real time using RL / physics.

Tech Stack : 
    Python Backend w/ gymnasium + FastAPI + Pydantic + SQL Alchemy
    React Frontend w/ Three.JS + Vite
    
Project Progress:
Sprint 1: Built simple MVP to get the project up and running. Implemented basic back-end using FastAPI for RESTful API quickly (via Uvicorn, Pydantic, SQLAlchemy), connecting the gymnasium based RL simulation to the PostgreSQL database. Built a React based frontend using Three.JS for 3-D visualization for a clean UI of the simulation.
    Have a lot of work to do, mainly in understanding the physcis and fleshing it out to become more complex/dynamic, to allow for understandings of real factory processes and hopefully see some interesting RL. 

Sprint 2: Refactored the backend from a gym driven sim to a handmade DES kernel to reflect industry standard because it allows for a more independent and reliable simulation of the factory. Obviously front end had to be refactored to reflect these changes. Still have to run simulation step by step for vis and RL , but have the option to run full simulations for maybe lager experiments. Working towards a setup that allows for actual insightful work (previously it was too reliant on making RL easy which was essentially useless). 
    This option opens up paths for operations + RL as seen in industry. We are lookin at manufacturing on the micro scale of operations so the thigns we will optimzie for are ordering of jobs, staff allotment for failures and optimizing, etc. Other paths would have been larger scale throughputs of say a whole factory which could be interesting with more diverse assemblies (i.e. parallel lines and decision , bottlenecks). Or even larger scale like throughput of entire factories over months and years and macro decisions there. 

    Overall turning into a more industrial eng/systems sim project which is cool but kind of ironic.
