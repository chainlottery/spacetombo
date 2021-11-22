import * as React from "react";
import { useEffect, useState } from "react";
import * as moment from "moment";
import { Typography } from "@mui/material";

const Countdown: React.FunctionComponent = () => {
  const raffleDate = moment("01/06/2022", "dd/mm/yyyy");
  const calculateTimeLeft = () => {
    let now = moment();
    let difference = raffleDate.diff(now);
    let timeLeft: any = {};
    if (difference > 0) {
      timeLeft = {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
      if (timeLeft.days < 10) timeLeft.days = `0${timeLeft.days}`;
      if (timeLeft.hours < 10) timeLeft.hours = `0${timeLeft.hours}`;
      if (timeLeft.minutes < 10) timeLeft.minutes = `0${timeLeft.minutes}`;
      if (timeLeft.seconds < 10) timeLeft.seconds = `0${timeLeft.seconds}`;
    }

    return timeLeft;
  };
  const [timeLeft, setTimeLeft] = useState(calculateTimeLeft()) as any;

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);
    return () => clearTimeout(timer);
  });

  const timerComponents: any = [];

  Object.keys(timeLeft).forEach((interval) => {
    if (!timeLeft[interval]) {
      return;
    }

    timerComponents.push(
      <Typography variant={"h4"} color={"white"} fontWeight={"bold"}>
        {timeLeft[interval]} {interval.slice(0, 1)}
      </Typography>
    );
  });

  return (
    <div className="landing_countdown">
      {timerComponents.length ? timerComponents : <span>Time's up!</span>}
    </div>
  );
};

export default Countdown;
